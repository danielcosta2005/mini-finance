import { and, eq, gte, lt, sql } from 'drizzle-orm';
import {
  accountBalances,
  accounts,
  budgetSpending,
  cardInstallments,
  cardPurchases,
  categories,
  invoices,
  transactions,
} from '../../db/schema/index.js';
import type { Database } from '../../db/types.js';

export function createDashboardRepository(db: Database) {
  return {
    async accountBalances(userId: string) {
      return db
        .select({
          id: accounts.id,
          name: accounts.name,
          type: accounts.type,
          archivedAt: accounts.archivedAt,
          balanceCents: accountBalances.balanceCents,
        })
        .from(accountBalances)
        .innerJoin(
          accounts,
          and(
            eq(accounts.id, accountBalances.accountId),
            eq(accounts.userId, accountBalances.userId),
          ),
        )
        .where(eq(accountBalances.userId, userId))
        .orderBy(accounts.name, accounts.id);
    },
    async transactionTotals(
      userId: string,
      start: string,
      endExclusive: string,
    ) {
      const month = sql<string>`to_char(${transactions.occurredOn}, 'YYYY-MM')`;
      return db
        .select({
          month,
          type: transactions.type,
          categoryId: categories.id,
          categoryName: categories.name,
          amountCents: sql<string>`sum(${transactions.amountCents})`,
        })
        .from(transactions)
        .innerJoin(
          categories,
          and(
            eq(categories.id, transactions.categoryId),
            eq(categories.userId, transactions.userId),
            eq(categories.type, transactions.type),
          ),
        )
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.occurredOn, start),
            lt(transactions.occurredOn, endExclusive),
          ),
        )
        .groupBy(month, transactions.type, categories.id, categories.name);
    },
    async installmentTotals(
      userId: string,
      start: string,
      endExclusive: string,
    ) {
      const month = sql<string>`to_char(${invoices.period}, 'YYYY-MM')`;
      return db
        .select({
          month,
          categoryId: categories.id,
          categoryName: categories.name,
          amountCents: sql<string>`sum(${cardInstallments.amountCents})`,
        })
        .from(cardInstallments)
        .innerJoin(
          invoices,
          and(
            eq(invoices.id, cardInstallments.invoiceId),
            eq(invoices.userId, cardInstallments.userId),
            eq(invoices.creditCardId, cardInstallments.creditCardId),
          ),
        )
        .innerJoin(
          cardPurchases,
          and(
            eq(cardPurchases.id, cardInstallments.purchaseId),
            eq(cardPurchases.userId, cardInstallments.userId),
            eq(cardPurchases.creditCardId, cardInstallments.creditCardId),
          ),
        )
        .innerJoin(
          categories,
          and(
            eq(categories.id, cardPurchases.categoryId),
            eq(categories.userId, cardPurchases.userId),
            eq(categories.type, cardPurchases.categoryType),
          ),
        )
        .where(
          and(
            eq(cardInstallments.userId, userId),
            gte(invoices.period, start),
            lt(invoices.period, endExclusive),
          ),
        )
        .groupBy(month, categories.id, categories.name);
    },
    async budgets(userId: string, period: string) {
      return db
        .select({
          id: budgetSpending.budgetId,
          categoryId: budgetSpending.categoryId,
          categoryName: categories.name,
          period: budgetSpending.period,
          limitCents: budgetSpending.limitCents,
          spentCents: budgetSpending.spentCents,
        })
        .from(budgetSpending)
        .innerJoin(
          categories,
          and(
            eq(categories.id, budgetSpending.categoryId),
            eq(categories.userId, budgetSpending.userId),
          ),
        )
        .where(
          and(
            eq(budgetSpending.userId, userId),
            eq(budgetSpending.period, period),
          ),
        )
        .orderBy(categories.name, budgetSpending.budgetId);
    },
  };
}
export type DashboardRepository = ReturnType<typeof createDashboardRepository>;
