import { and, asc, count, desc, eq, gte, lte } from 'drizzle-orm';
import { accounts, categories } from '../../db/schema/catalog.js';
import { transactions } from '../../db/schema/ledger.js';
import type { DbExecutor } from '../../db/types.js';
import type {
  CreateTransaction,
  PatchTransaction,
  TransactionsQuery,
} from './schemas.js';

export function createTransactionsRepository(db: DbExecutor) {
  const owned = (userId: string, id: string) =>
    and(eq(transactions.id, id), eq(transactions.userId, userId));
  return {
    async list(userId: string, query: TransactionsQuery) {
      const where = and(
        eq(transactions.userId, userId),
        query.from ? gte(transactions.occurredOn, query.from) : undefined,
        query.to ? lte(transactions.occurredOn, query.to) : undefined,
        query.accountId
          ? eq(transactions.accountId, query.accountId)
          : undefined,
        query.categoryId
          ? eq(transactions.categoryId, query.categoryId)
          : undefined,
        query.type ? eq(transactions.type, query.type) : undefined,
      );
      const order = query.order === 'asc' ? asc : desc;
      const sort = {
        date: transactions.occurredOn,
        amount: transactions.amountCents,
        createdAt: transactions.createdAt,
      }[query.sortBy];
      const [data, totals] = await Promise.all([
        db
          .select()
          .from(transactions)
          .where(where)
          .orderBy(order(sort), order(transactions.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ total: count() }).from(transactions).where(where),
      ]);
      return { data, total: totals[0]?.total ?? 0 };
    },
    async find(userId: string, id: string) {
      return (
        await db.select().from(transactions).where(owned(userId, id)).limit(1)
      )[0];
    },
    async findAccount(userId: string, id: string) {
      return (
        await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.userId, userId), eq(accounts.id, id)))
          .limit(1)
      )[0];
    },
    async findCategory(userId: string, id: string) {
      return (
        await db
          .select({ id: categories.id, type: categories.type })
          .from(categories)
          .where(and(eq(categories.userId, userId), eq(categories.id, id)))
          .limit(1)
      )[0];
    },
    async create(userId: string, input: CreateTransaction) {
      return (
        await db
          .insert(transactions)
          .values({ userId, ...input })
          .returning()
      )[0];
    },
    async update(userId: string, id: string, input: PatchTransaction) {
      return (
        await db
          .update(transactions)
          .set({ ...input, updatedAt: new Date() })
          .where(owned(userId, id))
          .returning()
      )[0];
    },
    async delete(userId: string, id: string) {
      return (
        await db
          .delete(transactions)
          .where(owned(userId, id))
          .returning({ id: transactions.id })
      )[0];
    },
  };
}
export type TransactionsRepository = ReturnType<
  typeof createTransactionsRepository
>;
