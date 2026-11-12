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
  async function categoryReference(
    userId: string,
    categoryId: string,
    scope: Pick<BudgetsRepository, 'findCategory'> = repository,
  ) {
    const category = await scope.findCategory(userId, categoryId);
    if (!category) throw notFound();
    if (category.type !== 'expense')
      throw businessRule('Orçamentos exigem uma categoria de despesa');
  }
  async function get(
    userId: string,
    id: string,
    scope: Pick<BudgetsRepository, 'find'> = repository,
  ) {
    const budget = await scope.find(userId, id);
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
      return repository.transaction(async (scope) => {
        await categoryReference(userId, input.categoryId, scope);
        const budget = await scope.create(userId, input);
        if (!budget) throw notFound();
        return get(userId, budget.id, scope);
      });
    },
    async update(userId: string, id: string, input: PatchBudget) {
      return repository.transaction(async (scope) => {
        const current = await scope.find(userId, id);
        if (!current) throw notFound();
        await categoryReference(
          userId,
          input.categoryId ?? current.categoryId,
          scope,
        );
        const budget = await scope.update(userId, id, input);
        if (!budget) throw notFound();
        return get(userId, budget.id, scope);
      });
    },
    async delete(userId: string, id: string) {
      const budget = await repository.delete(userId, id);
      if (!budget) throw notFound();
      return { id: budget.id, deleted: true as const };
    },
  };
}
export type BudgetsService = ReturnType<typeof createBudgetsService>;
