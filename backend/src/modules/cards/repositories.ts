import { and, asc, count, desc, eq, gte, lte } from 'drizzle-orm';
import {
  accounts,
  cardAvailableLimits,
  cardInstallments,
  cardPurchases,
  categories,
  creditCards,
  invoicePayments,
  invoices,
  invoiceTotals,
} from '../../db/schema/index.js';
import type { Database, DbExecutor } from '../../db/types.js';
import { withTransaction } from '../../shared/transaction.js';
import type {
  CardsQuery,
  CreateCard,
  CreatePurchase,
  InvoicesQuery,
  PurchasesQuery,
  UpdateCard,
} from './schemas.js';

type NewInvoice = typeof invoices.$inferInsert;
type NewPart = typeof cardInstallments.$inferInsert;
type NewPayment = typeof invoicePayments.$inferInsert;
function requiredRow<T>(row: T | undefined): T {
  if (row === undefined) throw new Error('Expected database row');
  return row;
}
const ownedCard = (userId: string, id: string) =>
  and(eq(creditCards.userId, userId), eq(creditCards.id, id));
const ownedInvoice = (userId: string, id: string) =>
  and(eq(invoices.userId, userId), eq(invoices.id, id));
const invoiceSelection = {
  invoice: invoices,
  totalCents: invoiceTotals.totalCents,
  paidCents: invoiceTotals.paidCents,
  outstandingCents: invoiceTotals.outstandingCents,
  paidOn: invoiceTotals.paidOn,
};

function repositoryFor(db: DbExecutor) {
  return {
    async getCard(userId: string, id: string) {
      const [row] = await db
        .select({
          card: creditCards,
          availableCents: cardAvailableLimits.availableCents,
        })
        .from(creditCards)
        .innerJoin(
          cardAvailableLimits,
          and(
            eq(cardAvailableLimits.creditCardId, creditCards.id),
            eq(cardAvailableLimits.userId, userId),
          ),
        )
        .where(ownedCard(userId, id));
      return row;
    },
    async lockCard(userId: string, id: string) {
      const [row] = await db
        .select()
        .from(creditCards)
        .where(ownedCard(userId, id))
        .for('update');
      return row;
    },
    async listCards(userId: string, query: CardsQuery) {
      const where = eq(creditCards.userId, userId);
      const rows = await db
        .select({
          card: creditCards,
          availableCents: cardAvailableLimits.availableCents,
        })
        .from(creditCards)
        .innerJoin(
          cardAvailableLimits,
          and(
            eq(cardAvailableLimits.creditCardId, creditCards.id),
            eq(cardAvailableLimits.userId, userId),
          ),
        )
        .where(where)
        .orderBy(asc(creditCards.name), asc(creditCards.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const [total] = await db
        .select({ value: count() })
        .from(creditCards)
        .where(where);
      return { rows, total: total?.value ?? 0 };
    },
    async createCard(userId: string, data: CreateCard) {
      const [row] = await db
        .insert(creditCards)
        .values({ ...data, userId })
        .returning();
      return requiredRow(row);
    },
    async updateCard(userId: string, id: string, data: UpdateCard) {
      const [row] = await db
        .update(creditCards)
        .set(data)
        .where(ownedCard(userId, id))
        .returning();
      return row;
    },
    async cardHasHistory(userId: string, id: string) {
      const [purchase] = await db
        .select({ id: cardPurchases.id })
        .from(cardPurchases)
        .where(
          and(
            eq(cardPurchases.userId, userId),
            eq(cardPurchases.creditCardId, id),
          ),
        )
        .limit(1);
      const [invoice] = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.userId, userId), eq(invoices.creditCardId, id)))
        .limit(1);
      return Boolean(purchase || invoice);
    },
    async deleteCard(userId: string, id: string) {
      await db.delete(creditCards).where(ownedCard(userId, id));
    },
    async lockCategory(userId: string, id: string) {
      const [row] = await db
        .select()
        .from(categories)
        .where(and(eq(categories.userId, userId), eq(categories.id, id)))
        .for('update');
      return row;
    },
    async lockAccount(userId: string, id: string) {
      const [row] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.userId, userId), eq(accounts.id, id)))
        .for('update');
      return row;
    },
    async createPurchase(userId: string, cardId: string, data: CreatePurchase) {
      const [row] = await db
        .insert(cardPurchases)
        .values({
          ...data,
          userId,
          creditCardId: cardId,
          categoryType: 'expense',
        })
        .returning();
      return requiredRow(row);
    },
    async listPurchases(userId: string, cardId: string, query: PurchasesQuery) {
      const where = and(
        eq(cardPurchases.userId, userId),
        eq(cardPurchases.creditCardId, cardId),
        query.from ? gte(cardPurchases.purchasedOn, query.from) : undefined,
        query.to ? lte(cardPurchases.purchasedOn, query.to) : undefined,
        query.categoryId
          ? eq(cardPurchases.categoryId, query.categoryId)
          : undefined,
      );
      const rows = await db
        .select()
        .from(cardPurchases)
        .where(where)
        .orderBy(desc(cardPurchases.purchasedOn), desc(cardPurchases.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const [total] = await db
        .select({ value: count() })
        .from(cardPurchases)
        .where(where);
      return { rows, total: total?.value ?? 0 };
    },
    async ensureInvoice(data: NewInvoice) {
      const [created] = await db
        .insert(invoices)
        .values(data)
        .onConflictDoNothing({
          target: [invoices.creditCardId, invoices.period],
        })
        .returning();
      if (created) return created;
      const [row] = await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.userId, data.userId),
            eq(invoices.creditCardId, data.creditCardId),
            eq(invoices.period, data.period),
          ),
        )
        .for('update');
      return requiredRow(row);
    },
    async insertInstallments(data: NewPart[]) {
      return db.insert(cardInstallments).values(data).returning();
    },
    async getInvoice(userId: string, id: string) {
      const [row] = await db
        .select(invoiceSelection)
        .from(invoices)
        .innerJoin(
          invoiceTotals,
          and(
            eq(invoiceTotals.invoiceId, invoices.id),
            eq(invoiceTotals.userId, userId),
          ),
        )
        .where(ownedInvoice(userId, id));
      return row;
    },
    async lockInvoice(userId: string, id: string) {
      const [row] = await db
        .select()
        .from(invoices)
        .where(ownedInvoice(userId, id))
        .for('update');
      return row;
    },
    async listInvoices(userId: string, cardId: string, query: InvoicesQuery) {
      const where = and(
        eq(invoices.userId, userId),
        eq(invoices.creditCardId, cardId),
        query.month ? eq(invoices.period, `${query.month}-01`) : undefined,
      );
      const rows = await db
        .select(invoiceSelection)
        .from(invoices)
        .innerJoin(
          invoiceTotals,
          and(
            eq(invoiceTotals.invoiceId, invoices.id),
            eq(invoiceTotals.userId, userId),
          ),
        )
        .where(where)
        .orderBy(desc(invoices.period), desc(invoices.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const [total] = await db
        .select({ value: count() })
        .from(invoices)
        .where(where);
      return { rows, total: total?.value ?? 0 };
    },
    async invoiceInstallments(userId: string, invoiceId: string) {
      return db
        .select({
          installment: cardInstallments,
          description: cardPurchases.description,
          purchasedOn: cardPurchases.purchasedOn,
          installmentCount: cardPurchases.installmentCount,
        })
        .from(cardInstallments)
        .innerJoin(
          cardPurchases,
          and(
            eq(cardPurchases.id, cardInstallments.purchaseId),
            eq(cardPurchases.userId, userId),
            eq(cardPurchases.creditCardId, cardInstallments.creditCardId),
          ),
        )
        .where(
          and(
            eq(cardInstallments.userId, userId),
            eq(cardInstallments.invoiceId, invoiceId),
          ),
        )
        .orderBy(
          asc(cardPurchases.purchasedOn),
          asc(cardInstallments.purchaseId),
          asc(cardInstallments.installmentNumber),
        );
    },
    async getPayment(userId: string, invoiceId: string) {
      const [row] = await db
        .select()
        .from(invoicePayments)
        .where(
          and(
            eq(invoicePayments.userId, userId),
            eq(invoicePayments.invoiceId, invoiceId),
          ),
        );
      return row;
    },
    async createPayment(data: NewPayment) {
      const [row] = await db.insert(invoicePayments).values(data).returning();
      return requiredRow(row);
    },
  };
}
export type CardsTransactionRepository = ReturnType<typeof repositoryFor>;
export type CardsRepository = CardsTransactionRepository & {
  transaction<T>(
    work: (repo: CardsTransactionRepository) => Promise<T>,
  ): Promise<T>;
};
export function createCardsRepository(db: Database): CardsRepository {
  return {
    ...repositoryFor(db),
    transaction: <T>(work: (repo: CardsTransactionRepository) => Promise<T>) =>
      withTransaction(db, (tx) => work(repositoryFor(tx))),
  };
}
