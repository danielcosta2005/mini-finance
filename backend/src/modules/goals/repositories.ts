import { and, count, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { goalContributions, goals } from '../../db/schema/index.js';
import type { NewGoal, NewGoalContribution } from '../../db/schema/types.js';
import type { Database, DbExecutor } from '../../db/types.js';
import { withTransaction } from '../../shared/transaction.js';
import type { GoalsQuery, UpdateGoal } from './schemas.js';

function scoped(db: DbExecutor) {
  const owner = (userId: string, id: string) =>
    and(eq(goals.userId, userId), eq(goals.id, id));
  // Explicit qualification avoids Drizzle's single-table projection dropping the outer table name.
  const contributed = sql<string>`coalesce((select sum(gc.amount_cents) from goal_contributions gc where gc.goal_id = "goals"."id" and gc.user_id = "goals"."user_id"), 0)`;
  const selection = { goal: goals, contributedCents: contributed };
  return {
    async list(userId: string, query: GoalsQuery) {
      const where = and(
        eq(goals.userId, userId),
        query.from ? gte(goals.dueOn, query.from) : undefined,
        query.to ? lte(goals.dueOn, query.to) : undefined,
      );
      const [rows, totals] = await Promise.all([
        db
          .select(selection)
          .from(goals)
          .where(where)
          .orderBy(goals.dueOn, goals.id)
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ total: count() }).from(goals).where(where),
      ]);
      return { rows, total: totals[0]?.total ?? 0 };
    },
    async find(userId: string, id: string) {
      return (
        await db.select(selection).from(goals).where(owner(userId, id))
      )[0];
    },
    async create(input: NewGoal) {
      return (await db.insert(goals).values(input).returning())[0];
    },
    async update(
      userId: string,
      id: string,
      input: UpdateGoal,
      updatedAt: Date,
    ) {
      return (
        await db
          .update(goals)
          .set({ ...input, updatedAt })
          .where(owner(userId, id))
          .returning()
      )[0];
    },
    async delete(userId: string, id: string) {
      return (
        await db
          .delete(goals)
          .where(owner(userId, id))
          .returning({ id: goals.id })
      )[0];
    },
    async contribute(input: NewGoalContribution) {
      return (await db.insert(goalContributions).values(input).returning())[0];
    },
    async contributions(userId: string, goalId: string, query: GoalsQuery) {
      const where = and(
        eq(goalContributions.userId, userId),
        eq(goalContributions.goalId, goalId),
        query.from
          ? gte(goalContributions.contributedOn, query.from)
          : undefined,
        query.to ? lte(goalContributions.contributedOn, query.to) : undefined,
      );
      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(goalContributions)
          .where(where)
          .orderBy(desc(goalContributions.contributedOn), goalContributions.id)
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ total: count() }).from(goalContributions).where(where),
      ]);
      return { rows, total: totals[0]?.total ?? 0 };
    },
  };
}
export function createGoalsRepository(db: Database) {
  return {
    ...scoped(db),
    transaction<T>(work: (scope: ReturnType<typeof scoped>) => Promise<T>) {
      return withTransaction(db, (tx) => work(scoped(tx)));
    },
  };
}
export type GoalsRepository = ReturnType<typeof createGoalsRepository>;
