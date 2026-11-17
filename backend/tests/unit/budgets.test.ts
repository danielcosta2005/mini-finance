import { describe, expect, it, vi } from 'vitest';
import type { BudgetsRepository } from '../../src/modules/budgets/repositories.js';
import {
  budgetsQuerySchema,
  createBudgetSchema,
  patchBudgetSchema,
} from '../../src/modules/budgets/schemas.js';
import { createBudgetsService } from '../../src/modules/budgets/services.js';

const userId = '10000000-0000-4000-8000-000000000001';
const id = '20000000-0000-4000-8000-000000000001';
const categoryId = '30000000-0000-4000-8000-000000000001';
const alternateId = '40000000-0000-4000-8000-000000000001';
type BudgetRow = NonNullable<Awaited<ReturnType<BudgetsRepository['find']>>>;
const row: BudgetRow = {
  id,
  userId,
  categoryId,
  categoryType: 'expense',
  period: '2026-01-01',
  limitCents: 10000,
  spentCents: '2500',
  createdAt: new Date('2026-01-01Z'),
  updatedAt: new Date('2026-01-01Z'),
};
const input = createBudgetSchema.parse({
  categoryId,
  month: '2026-01',
  limitCents: 10000,
});
function setup() {
  const scope = {
    list: vi
      .fn<BudgetsRepository['list']>()
      .mockResolvedValue({ data: [row], total: 3 }),
    find: vi.fn<BudgetsRepository['find']>().mockResolvedValue(row),
    findCategory: vi
      .fn<BudgetsRepository['findCategory']>()
      .mockResolvedValue({ id: categoryId, type: 'expense' }),
    create: vi.fn<BudgetsRepository['create']>().mockResolvedValue({ id }),
    update: vi.fn<BudgetsRepository['update']>().mockResolvedValue({ id }),
    delete: vi.fn<BudgetsRepository['delete']>().mockResolvedValue({ id }),
  };
  const transactionCalled = vi.fn<() => void>();
  let transaction: BudgetsRepository['transaction'] = async (work) =>
    work(scope);
  const repository = {
    ...scope,
    async transaction<T>(
      work: (value: Omit<BudgetsRepository, 'transaction'>) => Promise<T>,
    ): Promise<T> {
      transactionCalled();
      return transaction(work);
    },
  } satisfies BudgetsRepository;
  return {
    scope,
    repository,
    transactionCalled,
    setTransaction: (implementation: BudgetsRepository['transaction']) => {
      transaction = implementation;
    },
    service: createBudgetsService(repository),
  };
}

describe('budget service', () => {
  it('derives month, remaining money and percentage from repository spending', async () => {
    const { service, repository } = setup();
    expect(await service.get(userId, id)).toEqual({
      ...row,
      spentCents: 2500,
      remainingCents: 7500,
      month: '2026-01',
      percentageUsed: '25.00',
      exceeded: false,
    });
    expect(repository.find).toHaveBeenCalledWith(userId, id);
  });
  it.each([
    {
      spentCents: '0',
      remainingCents: 10000,
      percentageUsed: '0.00',
      exceeded: false,
    },
    {
      spentCents: '3333',
      remainingCents: 6667,
      percentageUsed: '33.33',
      exceeded: false,
    },
    {
      spentCents: '10000',
      remainingCents: 0,
      percentageUsed: '100.00',
      exceeded: false,
    },
    {
      spentCents: '15001',
      remainingCents: -5001,
      percentageUsed: '150.01',
      exceeded: true,
    },
  ])(
    'presents spending $spentCents with exact cents and percentage',
    async ({ spentCents, ...expected }) => {
      const { service, scope } = setup();
      scope.find.mockResolvedValue({ ...row, spentCents });
      expect(await service.get(userId, id)).toMatchObject(expected);
    },
  );
  it('calculates large safe spending via BigInt without intermediate rounding', async () => {
    const { service, scope } = setup();
    scope.find.mockResolvedValue({
      ...row,
      limitCents: Number.MAX_SAFE_INTEGER,
      spentCents: '9007199254740990',
    });
    expect(await service.get(userId, id)).toMatchObject({
      remainingCents: 1,
      percentageUsed: '99.99',
      spentCents: 9007199254740990,
    });
  });
  it('rejects unsafe spending instead of serializing rounded money', async () => {
    const { service, scope } = setup();
    scope.find.mockResolvedValue({ ...row, spentCents: '9007199254740992' });
    await expect(service.get(userId, id)).rejects.toMatchObject({
      status: 422,
    });
  });
  it('returns 404 when the budget does not belong to the caller', async () => {
    const { service, scope } = setup();
    scope.find.mockResolvedValue(undefined);
    await expect(service.get(userId, id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('paginates presented spending and forwards filters', async () => {
    const { service, repository } = setup();
    const query = budgetsQuerySchema.parse({
      page: 2,
      pageSize: 2,
      categoryId,
      month: '2026-01',
    });
    expect(await service.list(userId, query)).toMatchObject({
      data: [{ remainingCents: 7500 }],
      pagination: { page: 2, pageSize: 2, total: 3, totalPages: 2 },
    });
    expect(repository.list).toHaveBeenCalledWith(userId, query);
    expect(repository.findCategory).toHaveBeenCalledWith(userId, categoryId);
  });
  it('skips category ownership lookup for an unfiltered list', async () => {
    const { service, repository } = setup();
    await service.list(userId, budgetsQuerySchema.parse({}));
    expect(repository.findCategory).not.toHaveBeenCalled();
  });
  it('rejects a foreign category filter before querying budgets', async () => {
    const { service, repository } = setup();
    repository.findCategory.mockResolvedValue(undefined);
    await expect(
      service.list(userId, budgetsQuerySchema.parse({ categoryId })),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.list).not.toHaveBeenCalled();
  });
  it('creates and reads spending in the same transaction scope', async () => {
    const { service, transactionCalled, scope } = setup();
    expect(await service.create(userId, input)).toMatchObject({
      month: '2026-01',
      remainingCents: 7500,
    });
    expect(transactionCalled).toHaveBeenCalledOnce();
    expect(scope.findCategory).toHaveBeenCalledWith(userId, categoryId);
    expect(scope.create).toHaveBeenCalledWith(userId, input);
    expect(scope.find).toHaveBeenCalledWith(userId, id);
  });
  it.each(['missing', 'income'] as const)(
    'rejects %s category before creating a budget',
    async (kind) => {
      const { service, scope } = setup();
      scope.findCategory.mockResolvedValue(
        kind === 'missing' ? undefined : { id: categoryId, type: 'income' },
      );
      await expect(service.create(userId, input)).rejects.toMatchObject({
        status: kind === 'missing' ? 404 : 422,
      });
      expect(scope.create).not.toHaveBeenCalled();
    },
  );
  it('returns 404 when create does not return a budget id', async () => {
    const { service, scope } = setup();
    scope.create.mockResolvedValue(undefined);
    await expect(service.create(userId, input)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('validates the current category when patch omits a replacement', async () => {
    const { service, scope } = setup();
    await service.update(userId, id, { limitCents: 20000 });
    expect(scope.findCategory).toHaveBeenCalledWith(userId, categoryId);
    expect(scope.update).toHaveBeenCalledWith(userId, id, {
      limitCents: 20000,
    });
    expect(scope.find).toHaveBeenCalledTimes(2);
  });
  it('validates the replacement category and returns the updated read', async () => {
    const { service, scope } = setup();
    scope.find.mockResolvedValueOnce(row).mockResolvedValue({
      ...row,
      categoryId: alternateId,
      period: '2026-02-01',
    });
    const patch = { categoryId: alternateId, month: '2026-02' };
    expect(await service.update(userId, id, patch)).toMatchObject({
      categoryId: alternateId,
      month: '2026-02',
    });
    expect(scope.findCategory).toHaveBeenCalledWith(userId, alternateId);
    expect(scope.update).toHaveBeenCalledWith(userId, id, patch);
  });
  it('rejects a missing budget before validating patch references', async () => {
    const { service, scope } = setup();
    scope.find.mockResolvedValue(undefined);
    await expect(
      service.update(userId, id, { month: '2026-02' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(scope.findCategory).not.toHaveBeenCalled();
    expect(scope.update).not.toHaveBeenCalled();
  });
  it('returns 404 when an update no longer matches a budget', async () => {
    const { service, scope } = setup();
    scope.update.mockResolvedValue(undefined);
    await expect(
      service.update(userId, id, { limitCents: 20000 }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('rejects a failed transactional read after an update', async () => {
    const { service, scope } = setup();
    scope.find.mockResolvedValueOnce(row).mockResolvedValueOnce(undefined);
    await expect(
      service.update(userId, id, { limitCents: 20000 }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('lets an overflow escape the transaction callback so the repository can roll back', async () => {
    const { service, setTransaction, scope } = setup();
    let committed = false;
    let rolledBack = false;
    scope.find.mockResolvedValue({ ...row, spentCents: '9007199254740992' });
    setTransaction(async (work) => {
      try {
        const result = await work(scope);
        committed = true;
        return result;
      } catch (error) {
        rolledBack = true;
        throw error;
      }
    });
    await expect(service.create(userId, input)).rejects.toMatchObject({
      status: 422,
    });
    expect(scope.create).toHaveBeenCalledOnce();
    expect(committed).toBe(false);
    expect(rolledBack).toBe(true);
  });
  it('deletes the scoped budget and rejects a missing row', async () => {
    const { service, repository } = setup();
    expect(await service.delete(userId, id)).toEqual({ id, deleted: true });
    expect(repository.delete).toHaveBeenCalledWith(userId, id);
    repository.delete.mockResolvedValue(undefined);
    await expect(service.delete(userId, id)).rejects.toMatchObject({
      status: 404,
    });
  });
});
describe('budget schemas', () => {
  it('accepts a month and positive integer cents', () => {
    expect(createBudgetSchema.parse(input)).toEqual(input);
    expect(patchBudgetSchema.parse({ month: '2026-12' })).toEqual({
      month: '2026-12',
    });
  });
  it.each([
    { month: '2026-00' },
    { month: '2026-13' },
    { month: '0000-01' },
    { month: '2026-1' },
    { month: '2026-01-01' },
    { categoryId: 'invalid' },
    { limitCents: 0 },
    { limitCents: 1.5 },
    { limitCents: Number.MAX_SAFE_INTEGER + 1 },
    { userId },
  ])('rejects invalid budget case %#', (changes) => {
    expect(createBudgetSchema.safeParse({ ...input, ...changes }).success).toBe(
      false,
    );
  });
  it('requires a real patch field', () => {
    expect(patchBudgetSchema.safeParse({}).success).toBe(false);
    expect(patchBudgetSchema.safeParse({ limitCents: undefined }).success).toBe(
      false,
    );
  });
  it('supplies query defaults and accepts supported filters and sorting', () => {
    expect(budgetsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      sortBy: 'month',
      order: 'desc',
    });
    expect(
      budgetsQuerySchema.parse({
        month: '2026-01',
        categoryId,
        sortBy: 'limit',
        order: 'asc',
        page: '2',
      }),
    ).toMatchObject({
      month: '2026-01',
      categoryId,
      sortBy: 'limit',
      order: 'asc',
      page: 2,
    });
    expect(budgetsQuerySchema.safeParse({ month: '2026-13' }).success).toBe(
      false,
    );
  });
});
