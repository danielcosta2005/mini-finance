import { ApiError, businessRule, notFound } from '../../shared/api-error.js';
import { getInvoiceDates } from '../../shared/billing.js';
import { type Clock, today } from '../../shared/clock.js';
import { paginated, safeCents } from '../../shared/http.js';
import { getInstallmentCents } from '../../shared/installments.js';
import type {
  CardsRepository,
  CardsTransactionRepository,
} from './repositories.js';
import type {
  CardsQuery,
  CreateCard,
  CreatePurchase,
  InvoicesQuery,
  PayInvoice,
  PurchasesQuery,
  UpdateCard,
} from './schemas.js';

type CardRow = NonNullable<Awaited<ReturnType<CardsRepository['getCard']>>>;
type InvoiceRow = NonNullable<
  Awaited<ReturnType<CardsRepository['getInvoice']>>
>;
const cardJson = (row: CardRow) => ({
  ...row.card,
  availableCents: safeCents(row.availableCents),
});
const invoiceJson = (row: InvoiceRow) => ({
  ...row.invoice,
  totalCents: safeCents(row.totalCents),
  paidCents: safeCents(row.paidCents),
  outstandingCents: safeCents(row.outstandingCents),
  paidOn: row.paidOn,
  status: row.paidOn ? 'paid' : 'open',
});
const conflict = (message: string) => new ApiError(409, 'CONFLICT', message);

async function requireCard(
  repo: CardsTransactionRepository,
  userId: string,
  id: string,
) {
  const card = await repo.getCard(userId, id);
  if (!card) throw notFound();
  return card;
}
async function invoiceDetail(
  repo: CardsTransactionRepository,
  userId: string,
  id: string,
) {
  const row = await repo.getInvoice(userId, id);
  if (!row) throw notFound();
  const installments = await repo.invoiceInstallments(userId, id);
  const payment = await repo.getPayment(userId, id);
  return {
    ...invoiceJson(row),
    installments: installments.map(({ installment, ...purchase }) => ({
      ...installment,
      ...purchase,
    })),
    payment: payment ?? null,
  };
}

export function createCardsService(
  repo: CardsRepository,
  clock: Clock,
  timeZone: string,
) {
  return {
    async listCards(userId: string, query: CardsQuery) {
      const { rows, total } = await repo.listCards(userId, query);
      return paginated(rows.map(cardJson), total, query);
    },
    async getCard(userId: string, id: string) {
      return cardJson(await requireCard(repo, userId, id));
    },
    async createCard(userId: string, data: CreateCard) {
      const card = await repo.createCard(userId, data);
      return cardJson(await requireCard(repo, userId, card.id));
    },
    async updateCard(userId: string, id: string, data: UpdateCard) {
      return repo.transaction(async (tx) => {
        if (!(await tx.lockCard(userId, id))) throw notFound();
        await tx.updateCard(userId, id, data);
        return cardJson(await requireCard(tx, userId, id));
      });
    },
    async deleteCard(userId: string, id: string) {
      return repo.transaction(async (tx) => {
        if (!(await tx.lockCard(userId, id))) throw notFound();
        if (await tx.cardHasHistory(userId, id))
          throw conflict(
            'Cartão com histórico financeiro não pode ser excluído',
          );
        await tx.deleteCard(userId, id);
        return { id, deleted: true as const };
      });
    },
    async listPurchases(userId: string, cardId: string, query: PurchasesQuery) {
      await requireCard(repo, userId, cardId);
      if (
        query.categoryId &&
        !(await repo.lockCategory(userId, query.categoryId))
      )
        throw notFound();
      const { rows, total } = await repo.listPurchases(userId, cardId, query);
      return paginated(rows, total, query);
    },
    async createPurchase(userId: string, cardId: string, data: CreatePurchase) {
      return repo.transaction(async (tx) => {
        const card = await tx.lockCard(userId, cardId);
        if (!card) throw notFound();
        if (card.archivedAt)
          throw businessRule('Cartão arquivado não aceita compras');
        const category = await tx.lockCategory(userId, data.categoryId);
        if (!category) throw notFound();
        if (category.type !== 'expense' || category.archivedAt)
          throw businessRule('Selecione uma categoria de despesa ativa');
        // Calculate every date before writing; an out-of-range final month rejects all work.
        let dates: ReturnType<typeof getInvoiceDates>[];
        try {
          dates = Array.from({ length: data.installmentCount }, (_, index) =>
            getInvoiceDates(
              data.purchasedOn,
              card.closingDay,
              card.dueDay,
              index,
            ),
          );
        } catch (error) {
          if (error instanceof RangeError)
            throw businessRule(
              'As parcelas ultrapassam o intervalo de datas suportado',
            );
          throw error;
        }
        const purchase = await tx.createPurchase(userId, cardId, data);
        const parts = [];
        for (const [index, schedule] of dates.entries()) {
          const invoice = await tx.ensureInvoice({
            ...schedule,
            userId,
            creditCardId: cardId,
            closingDay: card.closingDay,
            dueDay: card.dueDay,
          });
          if (index === 0) {
            // Existing invoice calendars are immutable even after changing card settings.
            const snapshot = getInvoiceDates(
              data.purchasedOn,
              invoice.closingDay,
              invoice.dueDay,
            );
            if (
              snapshot.period !== invoice.period ||
              snapshot.closesOn !== invoice.closesOn
            )
              throw conflict(
                'A data da compra não pertence ao calendário da fatura existente',
              );
          }
          if (await tx.getPayment(userId, invoice.id))
            throw conflict(
              'Não é possível incluir parcelas em uma fatura quitada',
            );
          parts.push({
            userId,
            purchaseId: purchase.id,
            creditCardId: cardId,
            invoiceId: invoice.id,
            installmentNumber: index + 1,
            amountCents: getInstallmentCents(
              data.totalCents,
              data.installmentCount,
              index + 1,
            ),
          });
        }
        const installments = await tx.insertInstallments(parts);
        return { ...purchase, installments };
      });
    },
    async listInvoices(userId: string, cardId: string, query: InvoicesQuery) {
      await requireCard(repo, userId, cardId);
      const { rows, total } = await repo.listInvoices(userId, cardId, query);
      return paginated(rows.map(invoiceJson), total, query);
    },
    async getInvoice(userId: string, id: string) {
      return invoiceDetail(repo, userId, id);
    },
    async payInvoice(userId: string, id: string, data: PayInvoice) {
      return repo.transaction(async (tx) => {
        const initial = await tx.getInvoice(userId, id);
        if (!initial) throw notFound();
        // Use the same card-first order as purchases to serialize changes in the total.
        if (!(await tx.lockCard(userId, initial.invoice.creditCardId)))
          throw notFound();
        const account = await tx.lockAccount(userId, data.accountId);
        if (!account) throw notFound();
        if (!(await tx.lockInvoice(userId, id))) throw notFound();
        if (await tx.getPayment(userId, id))
          throw conflict('Fatura já quitada');
        if (account.archivedAt) throw businessRule('Selecione uma conta ativa');
        const row = await tx.getInvoice(userId, id);
        if (!row) throw notFound();
        const amountCents = safeCents(row.totalCents);
        const paidOn = data.paidOn ?? today(clock, timeZone);
        if (amountCents <= 0)
          throw businessRule(
            'A fatura deve possuir valor positivo para quitação',
          );
        if (paidOn < row.invoice.closesOn)
          throw businessRule(
            'A quitação deve ocorrer no fechamento da fatura ou após ele',
          );
        await tx.createPayment({
          userId,
          invoiceId: id,
          accountId: data.accountId,
          amountCents,
          paidOn,
        });
        return invoiceDetail(tx, userId, id);
      });
    },
  };
}
export type CardsService = ReturnType<typeof createCardsService>;
