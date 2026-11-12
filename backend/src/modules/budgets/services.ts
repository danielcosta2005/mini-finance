import { businessRule, notFound } from '../../shared/api-error.js';
import { paginated, percentage, safeCents } from '../../shared/http.js';
import type { BudgetsRepository } from './repositories.js';
import type { BudgetsQuery, CreateBudget, PatchBudget } from './schemas.js';

type BudgetWithSpending = NonNullable<
  Awaited<ReturnType<BudgetsRepository['find']>>
>;

function present(budget: BudgetWithSpending) {
  const spent = BigInt(budget.spentCents);
  const limit = BigInt(budget.limitCents);
  return {
    ...budget,
    month: budget.period.slice(0, 7),
    limitCents: safeCents(limit),
    spentCents: safeCents(spent),
    remainingCents: safeCents(limit - spent),
    percentageUsed: percentage(spent, limit),
    exceeded: spent > limit,
  };
}

export function createBudgetsService(repository: BudgetsRepository) {
  async function categoryReference(userId: string, categoryId: string) {
    const category = await repository.findCategory(userId, categoryId);
    if (!category) throw notFound();
    if (category.type !== 'expense')
      throw businessRule('Orçamentos exigem uma categoria de despesa');
  }
  async function get(userId: string, id: string) {
    const budget = await repository.find(userId, id);
    if (!budget) throw notFound();
    return present(budget);
  }
  return {
    async list(userId: string, query: BudgetsQuery) {
      if (
        query.categoryId &&
        !(await repository.findCategory(userId, query.categoryId))
      )
        throw notFound();
      const result = await repository.list(userId, query);
      return paginated(result.data.map(present), result.total, {
        page: query.page,
        pageSize: query.pageSize,
      });
    },
    get,
    async create(userId: string, input: CreateBudget) {
      await categoryReference(userId, input.categoryId);
      const budget = await repository.create(userId, input);
      if (!budget) throw notFound();
      return get(userId, budget.id);
    },
    async update(userId: string, id: string, input: PatchBudget) {
      const current = await repository.find(userId, id);
      if (!current) throw notFound();
      const merged: CreateBudget = {
        categoryId: input.categoryId ?? current.categoryId,
        month: input.month ?? current.period.slice(0, 7),
        limitCents: input.limitCents ?? current.limitCents,
      };
      await categoryReference(userId, merged.categoryId);
      const budget = await repository.update(userId, id, input);
      if (!budget) throw notFound();
      return get(userId, budget.id);
    },
    async delete(userId: string, id: string) {
      const budget = await repository.delete(userId, id);
      if (!budget) throw notFound();
      return { id: budget.id, deleted: true as const };
    },
  };
}
export type BudgetsService = ReturnType<typeof createBudgetsService>;
