import { and, count, eq, lte, sql } from 'drizzle-orm';
import {
  accounts,
  categories,
  recurrences,
  transactions,
} from '../../db/schema/index.js';
import type {
  NewRecurrence,
  NewTransaction,
  Recurrence,
} from '../../db/schema/types.js';
import type { Database, DbExecutor } from '../../db/types.js';
import { withTransaction } from '../../shared/transaction.js';
import type { RecurrencesQuery } from './schemas.js';

function scoped(db: DbExecutor) {
  const owner = (userId: string, id: string) =>
    and(eq(recurrences.userId, userId), eq(recurrences.id, id));
  const due = (userId: string, date: string) =>
    and(
      eq(recurrences.userId, userId),
      eq(recurrences.status, 'active'),
      lte(recurrences.nextExecutionOn, date),
    );
  return {
    async account(userId: string, id: string) {
      return (
        await db
          .select()
          .from(accounts)
          .where(and(eq(accounts.userId, userId), eq(accounts.id, id)))
      )[0];
    },
    async category(userId: string, id: string) {
      return (
        await db
          .select()
          .from(categories)
          .where(and(eq(categories.userId, userId), eq(categories.id, id)))
      )[0];
    },
    async list(userId: string, query: RecurrencesQuery) {
      const where = and(
        eq(recurrences.userId, userId),
        query.accountId
          ? eq(recurrences.accountId, query.accountId)
          : undefined,
        query.categoryId
          ? eq(recurrences.categoryId, query.categoryId)
          : undefined,
        query.type ? eq(recurrences.type, query.type) : undefined,
        query.status ? eq(recurrences.status, query.status) : undefined,
      );
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(recurrences)
          .where(where)
          .orderBy(recurrences.nextExecutionOn, recurrences.id)
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ total: count() }).from(recurrences).where(where),
      ]);
      return { rows, total: totals[0]?.total ?? 0 };
    },
    async find(userId: string, id: string) {
      return (await db.select().from(recurrences).where(owner(userId, id)))[0];
    },
    async lock(userId: string, id: string) {
      return (
        await db
          .select()
          .from(recurrences)
          .where(owner(userId, id))
          .for('update')
      )[0];
    },
    async create(input: NewRecurrence) {
      return (await db.insert(recurrences).values(input).returning())[0];
    },
    async update(userId: string, id: string, input: Partial<Recurrence>) {
      return (
        await db
          .update(recurrences)
          .set(input)
          .where(owner(userId, id))
          .returning()
      )[0];
    },
    async delete(userId: string, id: string) {
      return (
        await db
          .delete(recurrences)
          .where(owner(userId, id))
          .returning({ id: recurrences.id })
      )[0];
    },
    async latestOccurrence(userId: string, id: string) {
      return (
        (
          await db
            .select({
              date: sql<string | null>`max(${transactions.recurrenceOn})`,
            })
            .from(transactions)
            .where(
              and(
                eq(transactions.userId, userId),
                eq(transactions.recurrenceId, id),
              ),
            )
        )[0]?.date ?? null
      );
    },
    async lockDue(userId: string, date: string, limit: number) {
      return db
        .select()
        .from(recurrences)
        .where(due(userId, date))
        .orderBy(recurrences.nextExecutionOn, recurrences.id)
        .limit(limit)
        .for('update', { skipLocked: true });
    },
    async hasDue(userId: string, date: string) {
      return (
        (
          await db
            .select({ id: recurrences.id })
            .from(recurrences)
            .where(due(userId, date))
            .limit(1)
        ).length > 0
      );
    },
    async insertOccurrence(input: NewTransaction) {
      return (
        await db
          .insert(transactions)
          .values(input)
          .onConflictDoNothing({
            target: [transactions.recurrenceId, transactions.recurrenceOn],
          })
          .returning({ id: transactions.id })
      )[0];
    },
  };
}
export function createRecurrencesRepository(db: Database) {
  return {
    ...scoped(db),
    transaction<T>(work: (repo: ReturnType<typeof scoped>) => Promise<T>) {
      return withTransaction(db, (tx) => work(scoped(tx)));
    },
  };
}
export type RecurrencesRepository = ReturnType<
  typeof createRecurrencesRepository
>;
