import { parseEnvironment } from '../config/env.js';
import { passwordHasher } from '../modules/auth/services.js';
import { systemClock, today as todayInTimeZone } from '../shared/clock.js';
import { createDatabase } from './client.js';
import {
  accounts,
  budgets,
  cardInstallments,
  cardPurchases,
  categories,
  creditCards,
  goalContributions,
  goals,
  invoicePayments,
  invoices,
  recurrences,
  transactions,
  transfers,
  users,
} from './schema/index.js';

const DEMO_EMAIL = 'demo@minifinance.local';
const DEMO_PASSWORD = 'MiniFinance@Demo2026';

type CategoryKey =
  | 'salary'
  | 'freelance'
  | 'housing'
  | 'utilities'
  | 'groceries'
  | 'transport'
  | 'health'
  | 'leisure'
  | 'education'
  | 'travel';

const monthStart = (offset: number, from: Date) =>
  new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset, 1));

function monthDay(offset: number, day: number, from: Date) {
  const month = monthStart(offset, from);
  const lastDay = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();
  month.setUTCDate(Math.min(day, lastDay));
  return month;
}

const dateString = (date: Date) => date.toISOString().slice(0, 10);

function transactionDate(offset: number, day: number, today: Date) {
  const requested = monthDay(offset, day, today);
  if (offset === 0 && dateString(requested) > dateString(today))
    return dateString(today);
  return dateString(requested);
}

function nextOccurrence(day: number, today: Date) {
  const thisMonth = monthDay(0, day, today);
  return dateString(thisMonth) >= dateString(today)
    ? thisMonth
    : monthDay(1, day, today);
}

function requiredId(ids: Map<string, string>, key: string) {
  const id = ids.get(key);
  if (!id) throw new Error(`Missing seeded row: ${key}`);
  return id;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seed is disabled when NODE_ENV=production');
  }

  const env = parseEnvironment();
  const { db, pool } = createDatabase(env.DATABASE_URL);

  try {
    const passwordHash = await passwordHasher.hash(DEMO_PASSWORD);
    const timeZone = process.env.APP_TIME_ZONE ?? 'America/Sao_Paulo';
    const localDate = todayInTimeZone(systemClock, timeZone);
    const today = new Date(`${localDate}T00:00:00.000Z`);

    const seeded = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: 'Marina Costa (Demo)',
          email: DEMO_EMAIL,
          passwordHash,
        })
        .onConflictDoNothing()
        .returning({ id: users.id });
      if (!user) return false;

      const userId = user.id;
      const accountIds = new Map<string, string>();
      const accountRows = [
        {
          key: 'checking',
          name: 'Conta Corrente',
          type: 'checking' as const,
          openingBalanceCents: 385_000,
        },
        {
          key: 'savings',
          name: 'Reserva de Emergência',
          type: 'savings' as const,
          openingBalanceCents: 820_000,
        },
        {
          key: 'cash',
          name: 'Carteira',
          type: 'cash' as const,
          openingBalanceCents: 12_000,
        },
        {
          key: 'investment',
          name: 'Investimentos',
          type: 'investment' as const,
          openingBalanceCents: 1_250_000,
        },
      ];
      for (const row of accountRows) {
        const [created] = await tx
          .insert(accounts)
          .values({
            userId,
            name: row.name,
            type: row.type,
            openingBalanceCents: row.openingBalanceCents,
          })
          .returning({ id: accounts.id });
        if (!created) throw new Error(`Could not create account ${row.key}`);
        accountIds.set(row.key, created.id);
      }

      const categoryIds = new Map<CategoryKey, string>();
      const categoryRows: Array<{
        key: CategoryKey;
        name: string;
        type: 'income' | 'expense';
      }> = [
        { key: 'salary', name: 'Salário', type: 'income' },
        { key: 'freelance', name: 'Trabalho Extra', type: 'income' },
        { key: 'housing', name: 'Moradia', type: 'expense' },
        { key: 'utilities', name: 'Contas da Casa', type: 'expense' },
        { key: 'groceries', name: 'Mercado', type: 'expense' },
        { key: 'transport', name: 'Transporte', type: 'expense' },
        { key: 'health', name: 'Saúde', type: 'expense' },
        { key: 'leisure', name: 'Lazer', type: 'expense' },
        { key: 'education', name: 'Educação', type: 'expense' },
        { key: 'travel', name: 'Viagem', type: 'expense' },
      ];
      for (const row of categoryRows) {
        const [created] = await tx
          .insert(categories)
          .values({ userId, name: row.name, type: row.type })
          .returning({ id: categories.id });
        if (!created) throw new Error(`Could not create category ${row.key}`);
        categoryIds.set(row.key, created.id);
      }

      const categoryId = (key: CategoryKey) => requiredId(categoryIds, key);
      const checkingId = requiredId(accountIds, 'checking');
      const savingsId = requiredId(accountIds, 'savings');
      const cashId = requiredId(accountIds, 'cash');

      const [rentRecurrence] = await tx
        .insert(recurrences)
        .values({
          userId,
          accountId: checkingId,
          categoryId: categoryId('housing'),
          type: 'expense',
          description: 'Aluguel',
          amountCents: 180_000,
          frequency: 'monthly',
          intervalCount: 1,
          startsOn: dateString(monthDay(-5, 5, today)),
          nextExecutionOn: dateString(nextOccurrence(5, today)),
          status: 'active',
        })
        .returning({ id: recurrences.id });
      const [internetRecurrence] = await tx
        .insert(recurrences)
        .values({
          userId,
          accountId: checkingId,
          categoryId: categoryId('utilities'),
          type: 'expense',
          description: 'Internet residencial',
          amountCents: 11_990,
          frequency: 'monthly',
          intervalCount: 1,
          startsOn: dateString(monthDay(-4, 12, today)),
          nextExecutionOn: dateString(nextOccurrence(12, today)),
          status: 'active',
        })
        .returning({ id: recurrences.id });
      if (!rentRecurrence || !internetRecurrence)
        throw new Error('Could not create demo recurrences');

      const transactionRows: Array<{
        accountId: string;
        categoryId: string;
        type: 'income' | 'expense';
        amountCents: number;
        description: string;
        occurredOn: string;
        recurrenceId?: string;
        recurrenceOn?: string;
      }> = [];
      const groceryAmounts = [68_450, 73_290, 61_880, 82_140, 54_390];

      for (const offset of [-4, -3, -2, -1, 0]) {
        const groceryAmount = groceryAmounts[offset + 4];
        if (groceryAmount === undefined)
          throw new Error(`Missing grocery amount for month offset ${offset}`);
        transactionRows.push({
          accountId: checkingId,
          categoryId: categoryId('salary'),
          type: 'income',
          amountCents: 560_000 + (offset === -2 ? 35_000 : 0),
          description: 'Salário mensal',
          occurredOn: transactionDate(offset, 2, today),
        });
        transactionRows.push({
          accountId: checkingId,
          categoryId: categoryId('groceries'),
          type: 'expense',
          amountCents: groceryAmount,
          description: 'Compras do mês no supermercado',
          occurredOn: transactionDate(offset, 8, today),
        });
        transactionRows.push({
          accountId: cashId,
          categoryId: categoryId('transport'),
          type: 'expense',
          amountCents: 12_500 + (offset + 4) * 700,
          description: 'Transporte e deslocamentos',
          occurredOn: transactionDate(offset, 14, today),
        });
        if (offset < 0 || today.getUTCDate() >= 5) {
          transactionRows.push({
            accountId: checkingId,
            categoryId: categoryId('housing'),
            type: 'expense',
            amountCents: 180_000,
            description: 'Aluguel',
            occurredOn: dateString(monthDay(offset, 5, today)),
            recurrenceId: rentRecurrence.id,
            recurrenceOn: dateString(monthDay(offset, 5, today)),
          });
        }
        if (offset < 0 || today.getUTCDate() >= 12) {
          transactionRows.push({
            accountId: checkingId,
            categoryId: categoryId('utilities'),
            type: 'expense',
            amountCents: 11_990,
            description: 'Internet residencial',
            occurredOn: dateString(monthDay(offset, 12, today)),
            recurrenceId: internetRecurrence.id,
            recurrenceOn: dateString(monthDay(offset, 12, today)),
          });
        }
      }
      transactionRows.push(
        {
          accountId: checkingId,
          categoryId: categoryId('freelance'),
          type: 'income',
          amountCents: 95_000,
          description: 'Projeto de design freelancer',
          occurredOn: transactionDate(-1, 18, today),
        },
        {
          accountId: checkingId,
          categoryId: categoryId('health'),
          type: 'expense',
          amountCents: 24_800,
          description: 'Consulta médica',
          occurredOn: transactionDate(-1, 22, today),
        },
        {
          accountId: checkingId,
          categoryId: categoryId('education'),
          type: 'expense',
          amountCents: 8_990,
          description: 'Livro de finanças pessoais',
          occurredOn: transactionDate(-2, 17, today),
        },
        {
          accountId: checkingId,
          categoryId: categoryId('leisure'),
          type: 'expense',
          amountCents: 16_500,
          description: 'Cinema e jantar',
          occurredOn: transactionDate(0, 19, today),
        },
      );
      await tx
        .insert(transactions)
        .values(transactionRows.map((row) => ({ userId, ...row })));

      await tx.insert(transfers).values({
        userId,
        sourceAccountId: checkingId,
        destinationAccountId: savingsId,
        amountCents: 50_000,
        occurredOn: transactionDate(0, 16, today),
        description: 'Aporte mensal para a reserva',
      });

      const budgetRows = [
        { key: 'groceries' as const, limitCents: 100_000 },
        { key: 'housing' as const, limitCents: 190_000 },
        { key: 'utilities' as const, limitCents: 35_000 },
        { key: 'transport' as const, limitCents: 45_000 },
        { key: 'health' as const, limitCents: 30_000 },
        { key: 'leisure' as const, limitCents: 50_000 },
        { key: 'education' as const, limitCents: 25_000 },
      ];
      await tx.insert(budgets).values(
        budgetRows.map((row) => ({
          userId,
          categoryId: categoryId(row.key),
          categoryType: 'expense' as const,
          period: dateString(monthStart(0, today)),
          limitCents: row.limitCents,
        })),
      );

      const [card] = await tx
        .insert(creditCards)
        .values({
          userId,
          name: 'Cartão Platinum',
          creditLimitCents: 600_000,
          closingDay: 20,
          dueDay: 5,
        })
        .returning({ id: creditCards.id });
      if (!card) throw new Error('Could not create demo credit card');

      const invoiceIds = new Map<number, string>();
      for (let offset = -2; offset <= 3; offset += 1) {
        const [invoice] = await tx
          .insert(invoices)
          .values({
            userId,
            creditCardId: card.id,
            period: dateString(monthStart(offset, today)),
            closesOn: dateString(monthDay(offset - 1, 20, today)),
            dueOn: dateString(monthDay(offset, 5, today)),
            closingDay: 20,
            dueDay: 5,
          })
          .returning({ id: invoices.id });
        if (!invoice) throw new Error(`Could not create invoice for ${offset}`);
        invoiceIds.set(offset, invoice.id);
      }

      const oldPurchaseDate = dateString(monthDay(-3, 10, today));
      const currentPurchaseDay = Math.min(10, today.getUTCDate());
      const currentPurchaseDate = dateString(
        monthDay(0, currentPurchaseDay, today),
      );
      const purchaseRows = [
        {
          purchasedOn: oldPurchaseDate,
          description: 'Fone Bluetooth parcelado',
          totalCents: 360_000,
          installmentCount: 3,
          categoryId: categoryId('leisure'),
          firstInvoiceOffset: -2,
        },
        {
          purchasedOn: currentPurchaseDate,
          description: 'Notebook para trabalho',
          totalCents: 180_000,
          installmentCount: 3,
          categoryId: categoryId('education'),
          firstInvoiceOffset: 1,
        },
      ];
      for (const purchaseRow of purchaseRows) {
        const [purchase] = await tx
          .insert(cardPurchases)
          .values({
            userId,
            creditCardId: card.id,
            categoryId: purchaseRow.categoryId,
            categoryType: 'expense',
            purchasedOn: purchaseRow.purchasedOn,
            description: purchaseRow.description,
            totalCents: purchaseRow.totalCents,
            installmentCount: purchaseRow.installmentCount,
          })
          .returning({ id: cardPurchases.id });
        if (!purchase) throw new Error('Could not create card purchase');

        const base = Math.floor(
          purchaseRow.totalCents / purchaseRow.installmentCount,
        );
        const remainder = purchaseRow.totalCents % purchaseRow.installmentCount;
        for (
          let installmentNumber = 1;
          installmentNumber <= purchaseRow.installmentCount;
          installmentNumber += 1
        ) {
          const invoiceId = invoiceIds.get(
            purchaseRow.firstInvoiceOffset + installmentNumber - 1,
          );
          if (!invoiceId) throw new Error('Missing invoice for installment');
          await tx.insert(cardInstallments).values({
            userId,
            purchaseId: purchase.id,
            creditCardId: card.id,
            invoiceId,
            installmentNumber,
            amountCents: base + (installmentNumber <= remainder ? 1 : 0),
          });
        }
      }

      const paidInvoiceId = invoiceIds.get(-2);
      if (!paidInvoiceId) throw new Error('Missing settled demo invoice');
      await tx.insert(invoicePayments).values({
        userId,
        invoiceId: paidInvoiceId,
        accountId: checkingId,
        amountCents: 120_000,
        paidOn: dateString(monthDay(-2, 12, today)),
      });

      const goalRows = [
        {
          key: 'travel',
          description: 'Viagem de férias',
          targetCents: 800_000,
          contributions: [50_000, 75_000, 45_000],
        },
        {
          key: 'reserve',
          description: 'Reserva de emergência',
          targetCents: 1_500_000,
          contributions: [100_000, 100_000, 120_000],
        },
      ];
      for (const [goalIndex, goalRow] of goalRows.entries()) {
        const [goal] = await tx
          .insert(goals)
          .values({
            userId,
            description: goalRow.description,
            targetCents: goalRow.targetCents,
            dueOn: dateString(monthDay(6 + goalIndex * 3, 1, today)),
          })
          .returning({ id: goals.id });
        if (!goal) throw new Error(`Could not create goal ${goalRow.key}`);
        await tx.insert(goalContributions).values(
          goalRow.contributions.map((amountCents, index) => ({
            userId,
            goalId: goal.id,
            amountCents,
            contributedOn: transactionDate(index - 2, 15, today),
          })),
        );
      }
      return true;
    });

    if (!seeded) {
      console.info(
        `Demo account ${DEMO_EMAIL} already exists; no data was changed.`,
      );
      return;
    }
    console.info('Demo account and financial sample data created.');
    console.info(`Email: ${DEMO_EMAIL}`);
    console.info(`Password: ${DEMO_PASSWORD}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : 'Unknown error while seeding demo data';
  console.error(`Demo seed failed: ${message}`);
  process.exitCode = 1;
});
