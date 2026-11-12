import { and, asc, count, desc, eq, getTableColumns } from 'drizzle-orm';
import { categories } from '../../db/schema/catalog.js';
import { budgets } from '../../db/schema/ledger.js';
import { budgetSpending } from '../../db/schema/views.js';
import type { DbExecutor } from '../../db/types.js';
import type { BudgetsQuery, CreateBudget, PatchBudget } from './schemas.js';

export function createBudgetsRepository(db: DbExecutor) {
  const owned = (userId: string, id: string) =>
    and(eq(budgets.id, id), eq(budgets.userId, userId));
  const spendingJoin = and(
    eq(budgets.id, budgetSpending.budgetId),
    eq(budgets.userId, budgetSpending.userId),
  );
  const selection = {
    ...getTableColumns(budgets),
    spentCents: budgetSpending.spentCents,
  };
  return {
    async list(userId: string, query: BudgetsQuery) {
      const where = and(
        eq(budgets.userId, userId),
        query.month ? eq(budgets.period, `${query.month}-01`) : undefined,
        query.categoryId ? eq(budgets.categoryId, query.categoryId) : undefined,
      );
      const order = query.order === 'asc' ? asc : desc;
      const sort = {
        month: budgets.period,
        limit: budgets.limitCents,
        createdAt: budgets.createdAt,
      }[query.sortBy];
      const [data, totals] = await Promise.all([
        db
          .select(selection)
          .from(budgets)
          .innerJoin(budgetSpending, spendingJoin)
          .where(where)
          .orderBy(order(sort), order(budgets.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db.select({ total: count() }).from(budgets).where(where),
      ]);
      return { data, total: totals[0]?.total ?? 0 };
    },
    async find(userId: string, id: string) {
      return (
        await db
          .select(selection)
          .from(budgets)
          .innerJoin(budgetSpending, spendingJoin)
          .where(owned(userId, id))
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
    async create(userId: string, input: CreateBudget) {
      return (
        await db
          .insert(budgets)
          .values({
            userId,
            categoryId: input.categoryId,
            period: `${input.month}-01`,
            limitCents: input.limitCents,
          })
          .returning({ id: budgets.id })
      )[0];
    },
    async update(userId: string, id: string, input: PatchBudget) {
      return (
        await db
          .update(budgets)
          .set({
            ...(input.categoryId === undefined
              ? {}
              : { categoryId: input.categoryId }),
            ...(input.month === undefined
              ? {}
              : { period: `${input.month}-01` }),
            ...(input.limitCents === undefined
              ? {}
              : { limitCents: input.limitCents }),
            updatedAt: new Date(),
          })
          .where(owned(userId, id))
          .returning({ id: budgets.id })
      )[0];
    },
    async delete(userId: string, id: string) {
      return (
        await db
          .delete(budgets)
          .where(owned(userId, id))
          .returning({ id: budgets.id })
      )[0];
    },
  };
}
export type BudgetsRepository = ReturnType<typeof createBudgetsRepository>;
