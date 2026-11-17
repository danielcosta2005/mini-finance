import { describe, expect, it, vi } from 'vitest';
import type { DashboardRepository } from '../../src/modules/dashboard/repositories.js';
import { dashboardQuerySchema } from '../../src/modules/dashboard/schemas.js';
import { createDashboardService } from '../../src/modules/dashboard/services.js';

const userId = '00000000-0000-4000-8000-000000000001';
type Direct = Awaited<
  ReturnType<DashboardRepository['transactionTotals']>
>[number];
type Budget = Awaited<ReturnType<DashboardRepository['budgets']>>[number];
const direct = (overrides: Partial<Direct> = {}): Direct => ({
  month: '2026-02',
  categoryId: 'category-a',
  categoryName: 'Categoria fictícia',
  type: 'expense',
  amountCents: '200',
  ...overrides,
});
const budget = (overrides: Partial<Budget> = {}): Budget => ({
  id: 'budget-a',
  categoryId: 'category-a',
  categoryName: 'Categoria fictícia',
  period: '2026-02-01',
  limitCents: 1000,
  spentCents: '300',
  ...overrides,
});
function setup() {
  const repo = {
    accountBalances: vi
      .fn<DashboardRepository['accountBalances']>()
      .mockResolvedValue([]),
    transactionTotals: vi
      .fn<DashboardRepository['transactionTotals']>()
      .mockResolvedValue([]),
    installmentTotals: vi
      .fn<DashboardRepository['installmentTotals']>()
      .mockResolvedValue([]),
    budgets: vi.fn<DashboardRepository['budgets']>().mockResolvedValue([]),
  };
  return {
    repo,
    service: createDashboardService(repo, {
      now: () => new Date('2026-03-01T01:00:00Z'),
    }),
  };
}
describe('dashboard financial aggregation', () => {
  it('uses the clock local month and zero-fills twelve months', async () => {
    const { service } = setup();
    const result = await service.get(userId, {});
    expect(result.month).toBe('2026-02');
    expect(result.totals).toEqual({
      balanceCents: 0,
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
    });
    expect(result.evolution).toHaveLength(12);
    expect(result.evolution[0]?.month).toBe('2025-03');
    expect(result.budgets.progressPercentage).toBe('0.00');
  });
  it.each(['0001-01', '0001-02', '0001-11', '0001-12', '2026-12'])(
    'keeps query history within the financial calendar for %s',
    async (month) => {
      const { repo, service } = setup();
      const result = await service.get(userId, { month });
      expect(result.evolution.at(-1)?.month).toBe(month);
      expect(result.evolution.length).toBe(
        month.startsWith('0001-') ? Number(month.slice(5)) : 12,
      );
      expect(repo.transactionTotals.mock.calls[0]?.[1]).toBe(
        month.startsWith('0001-') ? '0001-01-01' : '2026-01-01',
      );
      expect(repo.budgets).toHaveBeenCalledWith(userId, `${month}-01`);
    },
  );
  it('passes an exclusive upper month boundary to both expense sources', async () => {
    const { repo, service } = setup();
    await service.get(userId, { month: '2026-12' });
    for (const query of [repo.transactionTotals, repo.installmentTotals])
      expect(query).toHaveBeenCalledWith(userId, '2026-01-01', '2027-01-01');
  });
  it('combines direct expenses and card installments once without changing income', async () => {
    const { repo, service } = setup();
    repo.transactionTotals.mockResolvedValue([
      direct(),
      direct({ type: 'income', amountCents: '1000' }),
    ]);
    repo.installmentTotals.mockResolvedValue([direct({ amountCents: '334' })]);
    const result = await service.get(userId, { month: '2026-02' });
    expect(result.totals).toMatchObject({
      incomeCents: 1000,
      expenseCents: 534,
      netCents: 466,
    });
    expect(result.categories).toHaveLength(2);
    expect(
      result.categories.find((item) => item.type === 'expense'),
    ).toMatchObject({ amountCents: 534, percentage: '100.00' });
    expect(repo.installmentTotals).toHaveBeenCalledOnce();
  });
  it('includes prior months in evolution and excludes them from selected categories', async () => {
    const { repo, service } = setup();
    repo.transactionTotals.mockResolvedValue([
      direct({ month: '2026-01' }),
      direct({ amountCents: '100' }),
    ]);
    const result = await service.get(userId, { month: '2026-02' });
    expect(result.categories).toHaveLength(1);
    expect(result.categories[0]?.amountCents).toBe(100);
    expect(result.evolution.at(-2)).toMatchObject({
      month: '2026-01',
      expenseCents: 200,
      netCents: -200,
    });
  });
  it('sorts categories by exact amount then ID, independent of incoming order', async () => {
    const { repo, service } = setup();
    repo.transactionTotals.mockResolvedValue([
      direct({ categoryId: 'd', amountCents: '20' }),
      direct({ categoryId: 'c', amountCents: '5' }),
      direct({ categoryId: 'b', amountCents: '10' }),
      direct({ categoryId: 'a', amountCents: '10' }),
    ]);
    expect(
      (await service.get(userId, { month: '2026-02' })).categories.map(
        (item) => item.categoryId,
      ),
    ).toEqual(['d', 'a', 'b', 'c']);
  });
  it('sums signed balances with BigInt before safe serialization', async () => {
    const { repo, service } = setup();
    repo.accountBalances.mockResolvedValue([
      {
        id: 'a',
        name: 'Conta fictícia',
        type: 'checking',
        archivedAt: null,
        balanceCents: '9007199254740991',
      },
      {
        id: 'b',
        name: 'Reserva fictícia',
        type: 'savings',
        archivedAt: null,
        balanceCents: '-9007199254740990',
      },
    ]);
    const result = await service.get(userId, {});
    expect(result.totals.balanceCents).toBe(1);
    expect(result.accounts[0]?.balanceCents).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('rejects an unsafe aggregated expense', async () => {
    const { repo, service } = setup();
    repo.transactionTotals.mockResolvedValue([
      direct({ amountCents: '9007199254740991' }),
      direct({ amountCents: '1' }),
    ]);
    await expect(
      service.get(userId, { month: '2026-02' }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('computes exact budgets, negative remaining amounts and exceeded count', async () => {
    const { repo, service } = setup();
    repo.budgets.mockResolvedValue([
      budget({ spentCents: '1500' }),
      budget({ id: 'budget-b', limitCents: 2000, spentCents: '500' }),
    ]);
    expect((await service.get(userId, {})).budgets).toMatchObject({
      limitCents: 3000,
      spentCents: 2000,
      remainingCents: 1000,
      progressPercentage: '66.66',
      overBudgetCount: 1,
      items: [
        { remainingCents: -500, progressPercentage: '150.00', exceeded: true },
        { remainingCents: 1500, exceeded: false },
      ],
    });
  });
  it('treats an exactly exhausted budget as within limit', async () => {
    const { repo, service } = setup();
    repo.budgets.mockResolvedValue([budget({ spentCents: '1000' })]);
    expect((await service.get(userId, {})).budgets).toMatchObject({
      remainingCents: 0,
      overBudgetCount: 0,
    });
  });
});
describe('dashboard schema', () => {
  it('allows an omitted month', () =>
    expect(dashboardQuerySchema.parse({})).toEqual({}));
  it.each([
    { month: '2026-13' },
    { month: '2026-2' },
    { month: '0000-01' },
    { month: '2026-02-01' },
    { year: 2026 },
  ])('rejects malformed or unknown query fields %j', (query) =>
    expect(dashboardQuerySchema.safeParse(query).success).toBe(false),
  );
});
