import { describe, expect, it, vi } from 'vitest';
import type { GoalsRepository } from '../../src/modules/goals/repositories.js';
import {
  contributionSchema,
  contributionsQuerySchema,
  createGoalSchema,
  goalsQuerySchema,
  updateGoalSchema,
} from '../../src/modules/goals/schemas.js';
import { createGoalsService } from '../../src/modules/goals/services.js';

const userId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const now = new Date('2026-03-01T01:00:00Z');
type Found = NonNullable<Awaited<ReturnType<GoalsRepository['find']>>>;
function fixture(
  contributedCents = '250',
  overrides: Partial<Found['goal']> = {},
): Found {
  return {
    goal: {
      id,
      userId,
      description: 'Reserva fictícia',
      targetCents: 1000,
      dueOn: '2026-02-28',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    },
    contributedCents,
  };
}
function setup(row = fixture()) {
  const repo = {
    list: vi
      .fn<GoalsRepository['list']>()
      .mockResolvedValue({ rows: [row], total: 3 }),
    find: vi.fn<GoalsRepository['find']>().mockResolvedValue(row),
    create: vi.fn<GoalsRepository['create']>().mockResolvedValue(row.goal),
    update: vi.fn<GoalsRepository['update']>().mockResolvedValue(row.goal),
    delete: vi.fn<GoalsRepository['delete']>().mockResolvedValue({ id }),
    contribute: vi
      .fn<GoalsRepository['contribute']>()
      .mockResolvedValue(undefined),
    contributions: vi
      .fn<GoalsRepository['contributions']>()
      .mockResolvedValue({ rows: [], total: 0 }),
    transaction<T>(
      work: (scope: Omit<GoalsRepository, 'transaction'>) => Promise<T>,
    ): Promise<T> {
      return work(repo);
    },
  };
  vi.spyOn(repo, 'transaction');
  return { repo, service: createGoalsService(repo, { now: () => now }) };
}

describe('goal progress and ownership', () => {
  it.each([
    ['0', 1000, '0.00', false],
    ['250', 750, '25.00', false],
    ['1000', 0, '100.00', true],
    ['1501', 0, '150.10', true],
  ])(
    'computes exact progress for %s cents',
    async (amount, remaining, percentage, achieved) => {
      const { service } = setup(fixture(amount));
      expect(await service.get(userId, id)).toMatchObject({
        contributedCents: Number(amount),
        remainingCents: remaining,
        progressPercentage: percentage,
        achieved,
        overdue: false,
      });
    },
  );
  it('uses the local day to avoid marking a due-today goal overdue', async () => {
    const { service } = setup();
    expect((await service.get(userId, id)).overdue).toBe(false);
  });
  it('marks an unfinished goal overdue after its due date', async () => {
    expect(
      (
        await setup(fixture('999', { dueOn: '2026-02-27' })).service.get(
          userId,
          id,
        )
      ).overdue,
    ).toBe(true);
  });
  it('never marks achieved goals overdue', async () => {
    expect(
      (
        await setup(fixture('1000', { dueOn: '2020-01-01' })).service.get(
          userId,
          id,
        )
      ).overdue,
    ).toBe(false);
  });
  it('rejects unsafe aggregate cents instead of rounding', async () => {
    await expect(
      setup(fixture('9007199254740992')).service.get(userId, id),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('paginates computed DTOs and forwards filters', async () => {
    const { repo, service } = setup();
    const query = { page: 2, pageSize: 2, from: '2026-01-01' };
    expect(await service.list(userId, query)).toMatchObject({
      data: [{ remainingCents: 750 }],
      pagination: { page: 2, total: 3, totalPages: 2 },
    });
    expect(repo.list).toHaveBeenCalledWith(userId, query);
  });
  it('creates a goal with zero contributions and owner supplied by auth', async () => {
    const { repo, service } = setup();
    const input = createGoalSchema.parse({
      description: 'Reserva',
      targetCents: 1000,
      dueOn: '2027-01-01',
    });
    expect(await service.create(userId, input)).toMatchObject({
      contributedCents: 0,
      remainingCents: 1000,
    });
    expect(repo.create).toHaveBeenCalledWith({ ...input, userId });
  });
  it('returns 404 if create has no returned row', async () => {
    const { repo, service } = setup();
    repo.create.mockResolvedValue(undefined);
    await expect(service.create(userId, fixture().goal)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('updates within the repository transaction using the injected clock', async () => {
    const { repo, service } = setup();
    await service.update(userId, id, { targetCents: 2000 });
    expect(repo.transaction).toHaveBeenCalledOnce();
    expect(repo.update).toHaveBeenCalledWith(
      userId,
      id,
      { targetCents: 2000 },
      now,
    );
  });
  it.each(['get', 'contributions', 'contribute'] as const)(
    'conceals foreign goals for %s',
    async (action) => {
      const { repo, service } = setup();
      repo.find.mockResolvedValue(undefined);
      const promise =
        action === 'get'
          ? service.get(userId, id)
          : action === 'contributions'
            ? service.contributions(userId, id, { page: 1, pageSize: 20 })
            : service.contribute(userId, id, { amountCents: 25 });
      await expect(promise).rejects.toMatchObject({ status: 404 });
      expect(repo.contribute).not.toHaveBeenCalled();
    },
  );
  it('returns 404 for an update whose owned goal disappeared', async () => {
    const { repo, service } = setup();
    repo.update.mockResolvedValue(undefined);
    await expect(
      service.update(userId, id, { description: 'Nova reserva' }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('returns 404 when the updated goal cannot be read', async () => {
    const { repo, service } = setup();
    repo.find.mockResolvedValue(undefined);
    await expect(
      service.update(userId, id, { targetCents: 2000 }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('deletes owned goals', async () => {
    const { repo, service } = setup();
    expect(await service.delete(userId, id)).toEqual({ id, deleted: true });
    expect(repo.delete).toHaveBeenCalledWith(userId, id);
  });
  it('returns 404 for foreign deletion', async () => {
    const { repo, service } = setup();
    repo.delete.mockResolvedValue(undefined);
    await expect(service.delete(userId, id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('paginates contribution history only after checking ownership', async () => {
    const { repo, service } = setup();
    const query = { page: 1, pageSize: 20 };
    expect(await service.contributions(userId, id, query)).toMatchObject({
      data: [],
      pagination: { total: 0 },
    });
    expect(repo.contributions).toHaveBeenCalledWith(userId, id, query);
  });
  it.each([undefined, '2026-02-01'])(
    'records contributions without altering an account (%s)',
    async (contributedOn) => {
      const { repo, service } = setup();
      await service.contribute(userId, id, { amountCents: 123, contributedOn });
      expect(repo.contribute).toHaveBeenCalledWith({
        userId,
        goalId: id,
        amountCents: 123,
        contributedOn: contributedOn ?? '2026-02-28',
      });
      expect(repo.update).not.toHaveBeenCalled();
      expect(repo.transaction).not.toHaveBeenCalled();
    },
  );
});

describe('goal request schemas', () => {
  it('keeps PATCH sparse', () =>
    expect(updateGoalSchema.parse({ targetCents: 20 })).toEqual({
      targetCents: 20,
    }));
  it.each([
    {},
    { unknown: true },
    { targetCents: 0 },
    { dueOn: '2026-02-30' },
    { description: '   ' },
  ])('rejects invalid patches %j', (value) =>
    expect(updateGoalSchema.safeParse(value).success).toBe(false),
  );
  it.each([0, -1, 0.5, '100', Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid contribution amount %s',
    (amountCents) =>
      expect(contributionSchema.safeParse({ amountCents }).success).toBe(false),
  );
  it('rejects owner injection', () =>
    expect(
      createGoalSchema.safeParse({
        description: 'Reserva',
        targetCents: 100,
        dueOn: '2026-01-01',
        userId,
      }).success,
    ).toBe(false));
  it('shares pagination and ordered date filters for contributions', () => {
    expect(contributionsQuerySchema.parse({})).toEqual(
      goalsQuerySchema.parse({}),
    );
    expect(
      goalsQuerySchema.safeParse({ from: '2026-03-01', to: '2026-02-01' })
        .success,
    ).toBe(false);
  });
});
