import { describe, expect, it, vi } from 'vitest';
import type { RecurrencesRepository } from '../../src/modules/recurrences/repositories.js';
import {
  createRecurrenceSchema,
  processRecurrencesSchema,
  recurrencesQuerySchema,
  updateRecurrenceSchema,
} from '../../src/modules/recurrences/schemas.js';
import {
  createRecurrencesService,
  nextOccurrenceAfter,
} from '../../src/modules/recurrences/services.js';

const userId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const accountId = '00000000-0000-4000-8000-000000000003';
const categoryId = '00000000-0000-4000-8000-000000000004';
const now = new Date('2026-03-01T01:00:00Z');
type Rule = NonNullable<Awaited<ReturnType<RecurrencesRepository['find']>>>;
const rule = (overrides: Partial<Rule> = {}): Rule => ({
  id,
  userId,
  accountId,
  categoryId,
  type: 'expense',
  description: 'Despesa fictícia',
  amountCents: 100,
  frequency: 'monthly',
  intervalCount: 1,
  startsOn: '2026-01-31',
  endsOn: null,
  nextExecutionOn: '2026-01-31',
  status: 'active',
  createdAt: now,
  updatedAt: now,
  ...overrides,
});
function setup(existing = rule()) {
  const repo = {
    account: vi.fn<RecurrencesRepository['account']>().mockResolvedValue({
      id: accountId,
      userId,
      name: 'Conta fictícia',
      type: 'checking',
      openingBalanceCents: 0,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    }),
    category: vi.fn<RecurrencesRepository['category']>().mockResolvedValue({
      id: categoryId,
      userId,
      name: 'Categoria fictícia',
      type: 'expense',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    }),
    list: vi
      .fn<RecurrencesRepository['list']>()
      .mockResolvedValue({ rows: [existing], total: 1 }),
    find: vi.fn<RecurrencesRepository['find']>().mockResolvedValue(existing),
    lock: vi.fn<RecurrencesRepository['lock']>().mockResolvedValue(existing),
    create: vi
      .fn<RecurrencesRepository['create']>()
      .mockResolvedValue(existing),
    update: vi
      .fn<RecurrencesRepository['update']>()
      .mockImplementation(async (_owner, _id, input) => ({
        ...existing,
        ...input,
      })),
    delete: vi.fn<RecurrencesRepository['delete']>().mockResolvedValue({ id }),
    latestOccurrence: vi
      .fn<RecurrencesRepository['latestOccurrence']>()
      .mockResolvedValue(null),
    lockDue: vi
      .fn<RecurrencesRepository['lockDue']>()
      .mockResolvedValue([existing]),
    hasDue: vi.fn<RecurrencesRepository['hasDue']>().mockResolvedValue(false),
    insertOccurrence: vi
      .fn<RecurrencesRepository['insertOccurrence']>()
      .mockResolvedValue({ id: 'transaction-a' }),
    transaction<T>(
      work: (scope: Omit<RecurrencesRepository, 'transaction'>) => Promise<T>,
    ): Promise<T> {
      return work(repo);
    },
  };
  vi.spyOn(repo, 'transaction');
  return { repo, service: createRecurrencesService(repo, { now: () => now }) };
}

describe('anchored recurrence calendar', () => {
  it.each([
    ['2026-01-31', 'monthly', 1, '2026-01-31', '2026-02-28'],
    ['2026-01-31', 'monthly', 1, '2026-02-28', '2026-03-31'],
    ['2028-01-31', 'monthly', 1, '2028-01-31', '2028-02-29'],
    ['2028-02-29', 'yearly', 1, '2028-02-29', '2029-02-28'],
    ['2028-02-29', 'yearly', 1, '2031-02-28', '2032-02-29'],
    ['2026-12-31', 'daily', 2, '2026-12-31', '2027-01-02'],
    ['2026-01-01', 'weekly', 2, '2026-01-02', '2026-01-15'],
    ['2026-01-31', 'monthly', 3, '2026-02-20', '2026-04-30'],
    ['2026-01-31', 'monthly', 1, '2025-01-01', '2026-01-31'],
  ] as const)(
    'finds next %s %s occurrence after %s',
    (startsOn, frequency, intervalCount, after, expected) => {
      expect(
        nextOccurrenceAfter({ startsOn, frequency, intervalCount }, after),
      ).toBe(expected);
    },
  );
  it.each(['daily', 'weekly', 'monthly', 'yearly'] as const)(
    'stops %s schedules at year 9999',
    (frequency) => {
      expect(
        nextOccurrenceAfter(
          { startsOn: '9999-12-31', frequency, intervalCount: 1 },
          '9999-12-31',
        ),
      ).toBeUndefined();
    },
  );
});

describe('recurrence CRUD and ownership', () => {
  it('lists owned rules using verified category and account filters', async () => {
    const { repo, service } = setup();
    const query = { page: 1, pageSize: 20, categoryId, accountId };
    expect(await service.list(userId, query)).toMatchObject({
      data: [{ id }],
      pagination: { total: 1 },
    });
    expect(repo.account).toHaveBeenCalledWith(userId, accountId);
    expect(repo.category).toHaveBeenCalledWith(userId, categoryId);
  });
  it('lists without requiring optional filters', async () => {
    const { repo, service } = setup();
    await service.list(userId, { page: 1, pageSize: 20 });
    expect(repo.account).not.toHaveBeenCalled();
    expect(repo.category).not.toHaveBeenCalled();
  });
  it.each(['account', 'category'] as const)(
    'conceals foreign %s list filters',
    async (resource) => {
      const { repo, service } = setup();
      repo[resource].mockResolvedValue(undefined);
      await expect(
        service.list(userId, { page: 1, pageSize: 20, accountId, categoryId }),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.list).not.toHaveBeenCalled();
    },
  );
  it('gets only the owned recurrence', async () => {
    const { repo, service } = setup();
    expect(await service.get(userId, id)).toEqual(rule());
    expect(repo.find).toHaveBeenCalledWith(userId, id);
  });
  it('creates the first cursor at startsOn in the transaction', async () => {
    const { repo, service } = setup();
    const input = createRecurrenceSchema.parse({
      accountId,
      categoryId,
      type: 'expense',
      description: 'Despesa fictícia',
      amountCents: 100,
      startsOn: '2026-01-31',
    });
    await service.create(userId, input);
    expect(repo.create).toHaveBeenCalledWith({
      ...input,
      userId,
      nextExecutionOn: input.startsOn,
    });
    expect(repo.transaction).toHaveBeenCalledOnce();
  });
  it.each(['account', 'category'] as const)(
    'rejects creation with foreign %s',
    async (resource) => {
      const { repo, service } = setup();
      repo[resource].mockResolvedValue(undefined);
      await expect(service.create(userId, rule())).rejects.toMatchObject({
        status: 404,
      });
      expect(repo.create).not.toHaveBeenCalled();
    },
  );
  it('rejects a category with the wrong transaction type', async () => {
    const { repo, service } = setup();
    const category = await repo.category(userId, categoryId);
    if (!category) throw new Error('fixture');
    repo.category.mockResolvedValue({ ...category, type: 'income' });
    await expect(service.create(userId, rule())).rejects.toMatchObject({
      status: 422,
    });
  });
  it.each(['get', 'update', 'delete'] as const)(
    'returns 404 for foreign %s',
    async (action) => {
      const { repo, service } = setup();
      repo.find.mockResolvedValue(undefined);
      repo.lock.mockResolvedValue(undefined);
      await expect(
        action === 'get'
          ? service.get(userId, id)
          : action === 'update'
            ? service.update(userId, id, { amountCents: 500 })
            : service.delete(userId, id),
      ).rejects.toMatchObject({ status: 404 });
    },
  );
  it('deletes under the owned rule lock', async () => {
    const { repo, service } = setup();
    expect(await service.delete(userId, id)).toEqual({ id, deleted: true });
    expect(repo.delete).toHaveBeenCalledWith(userId, id);
  });
  it('retains the cursor and schedule on an amount-only patch', async () => {
    const { repo, service } = setup(rule({ nextExecutionOn: '2026-03-31' }));
    expect(
      await service.update(userId, id, { amountCents: 250 }),
    ).toMatchObject({
      amountCents: 250,
      nextExecutionOn: '2026-03-31',
      frequency: 'monthly',
      updatedAt: now,
    });
    expect(repo.latestOccurrence).not.toHaveBeenCalled();
  });
  it('merges all editable fields and explicitly clears the end date', async () => {
    const { service } = setup(rule({ endsOn: '2027-01-01' }));
    expect(
      await service.update(userId, id, {
        accountId,
        categoryId,
        type: 'expense',
        description: 'Outra despesa',
        amountCents: 250,
        frequency: 'weekly',
        intervalCount: 2,
        startsOn: '2026-02-01',
        endsOn: null,
        status: 'paused',
      }),
    ).toMatchObject({
      description: 'Outra despesa',
      endsOn: null,
      nextExecutionOn: '2026-02-01',
      status: 'paused',
    });
  });
  it('rejects an end date before the merged start date', async () => {
    const { repo, service } = setup();
    await expect(
      service.update(userId, id, { endsOn: '2025-12-01' }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('uses the latest generated occurrence as the schedule lower bound', async () => {
    const { repo, service } = setup();
    repo.latestOccurrence.mockResolvedValue('2026-03-31');
    expect(
      await service.update(userId, id, { frequency: 'monthly' }),
    ).toMatchObject({ nextExecutionOn: '2026-04-30' });
  });
  it('preserves stored progress when generated entries were deleted', async () => {
    const { service } = setup(rule({ nextExecutionOn: '2026-05-31' }));
    expect(
      await service.update(userId, id, { intervalCount: 1 }),
    ).toMatchObject({ nextExecutionOn: '2026-05-31' });
  });
  it('uses the cursor floor when the latest remaining transaction is older', async () => {
    const { repo, service } = setup(rule({ nextExecutionOn: '2026-05-31' }));
    repo.latestOccurrence.mockResolvedValue('2026-01-31');
    expect(
      await service.update(userId, id, { frequency: 'monthly' }),
    ).toMatchObject({ nextExecutionOn: '2026-05-31' });
  });
  it('completes a patched schedule whose next occurrence exceeds the end', async () => {
    const { repo, service } = setup();
    repo.latestOccurrence.mockResolvedValue('2026-01-31');
    expect(
      await service.update(userId, id, {
        endsOn: '2026-02-01',
        frequency: 'monthly',
      }),
    ).toMatchObject({ nextExecutionOn: '2026-02-28', status: 'completed' });
  });
  it('completes when the unchanged cursor is after a new end date', async () => {
    expect(
      await setup(rule({ nextExecutionOn: '2026-03-31' })).service.update(
        userId,
        id,
        { endsOn: '2026-02-28' },
      ),
    ).toMatchObject({ status: 'completed' });
  });
  it('completes when a changed calendar has no representable next occurrence', async () => {
    const { repo, service } = setup(
      rule({ startsOn: '9999-12-31', nextExecutionOn: '9999-12-31' }),
    );
    repo.latestOccurrence.mockResolvedValue('9999-12-31');
    expect(
      await service.update(userId, id, { frequency: 'yearly' }),
    ).toMatchObject({ nextExecutionOn: '9999-12-31', status: 'completed' });
  });
});

describe('processing recurrence occurrences', () => {
  it('uses the internal local clock and keeps the day-31 anchor after February', async () => {
    const { repo, service } = setup();
    const result = await service.process(userId);
    expect(result).toMatchObject({
      processedRules: 1,
      processedOccurrences: 2,
      createdTransactions: 2,
      more: false,
      limits: { rules: 100, occurrences: 1000 },
    });
    expect(repo.lockDue).toHaveBeenCalledWith(userId, '2026-02-28', 100);
    expect(
      repo.insertOccurrence.mock.calls.map(([input]) => input.occurredOn),
    ).toEqual(['2026-01-31', '2026-02-28']);
    expect(repo.update.mock.calls[0]?.[2]).toMatchObject({
      nextExecutionOn: '2026-03-31',
      status: 'active',
    });
  });
  it('does not generate future occurrences even when returned by the repository', async () => {
    const { repo, service } = setup(rule({ nextExecutionOn: '2026-03-01' }));
    expect(await service.process(userId)).toMatchObject({
      processedOccurrences: 0,
      createdTransactions: 0,
    });
    expect(repo.insertOccurrence).not.toHaveBeenCalled();
  });
  it('counts deduplicated occurrences as processed but not newly created', async () => {
    const { repo, service } = setup();
    repo.insertOccurrence.mockResolvedValue(undefined);
    expect(await service.process(userId)).toMatchObject({
      processedOccurrences: 2,
      createdTransactions: 0,
    });
    expect(repo.update.mock.calls[0]?.[2].nextExecutionOn).toBe('2026-03-31');
  });
  it('completes at the inclusive end date', async () => {
    const { repo, service } = setup(rule({ endsOn: '2026-01-31' }));
    expect(await service.process(userId)).toMatchObject({
      createdTransactions: 1,
    });
    expect(repo.update.mock.calls[0]?.[2]).toMatchObject({
      status: 'completed',
      nextExecutionOn: '2026-02-28',
    });
  });
  it('completes a rule already beyond its end date without generating transactions', async () => {
    const { repo, service } = setup(
      rule({ nextExecutionOn: '2026-02-28', endsOn: '2026-02-01' }),
    );
    await service.process(userId);
    expect(repo.insertOccurrence).not.toHaveBeenCalled();
    expect(repo.update.mock.calls[0]?.[2].status).toBe('completed');
  });
  it('handles an empty locked batch', async () => {
    const { repo, service } = setup();
    repo.lockDue.mockResolvedValue([]);
    expect(await service.process(userId)).toMatchObject({
      processedRules: 0,
      processedOccurrences: 0,
    });
    expect(repo.update).not.toHaveBeenCalled();
  });
  it('limits catch-up work to 1000 occurrences and leaves a resumable cursor', async () => {
    const { repo, service } = setup(
      rule({
        startsOn: '2000-01-01',
        nextExecutionOn: '2000-01-01',
        frequency: 'daily',
      }),
    );
    repo.lockDue.mockResolvedValue([
      rule({
        startsOn: '2000-01-01',
        nextExecutionOn: '2000-01-01',
        frequency: 'daily',
      }),
      rule({ id: 'second-rule' }),
    ]);
    repo.hasDue.mockResolvedValue(true);
    expect(await service.process(userId)).toMatchObject({
      processedRules: 1,
      processedOccurrences: 1000,
      createdTransactions: 1000,
      more: true,
    });
    expect(repo.insertOccurrence).toHaveBeenCalledTimes(1000);
    expect(repo.update.mock.calls[0]?.[2].nextExecutionOn).toBe('2002-09-27');
  });
  it('allows a later invocation to resume without re-inserting previous dates', async () => {
    const { repo, service } = setup();
    repo.update.mockImplementation(async (_owner, _id, patch) => {
      const updated = rule(patch);
      repo.lockDue.mockResolvedValue(
        updated.nextExecutionOn > '2026-02-28' ? [] : [updated],
      );
      return updated;
    });
    await service.process(userId);
    expect(await service.process(userId)).toMatchObject({
      processedRules: 0,
      createdTransactions: 0,
    });
    expect(repo.insertOccurrence).toHaveBeenCalledTimes(2);
  });
  it('leaves concurrent exclusion and deduplication to one repository transaction per invocation', async () => {
    const { repo, service } = setup();
    repo.lockDue.mockResolvedValueOnce([rule()]).mockResolvedValueOnce([]);
    const results = await Promise.all([
      service.process(userId),
      service.process(userId),
    ]);
    expect(
      results.reduce((sum, result) => sum + result.createdTransactions, 0),
    ).toBe(2);
    expect(repo.transaction).toHaveBeenCalledTimes(2);
    expect(repo.insertOccurrence.mock.calls[0]?.[0]).toMatchObject({
      recurrenceId: id,
      recurrenceOn: '2026-01-31',
      occurredOn: '2026-01-31',
      userId,
      accountId,
      categoryId,
      type: 'expense',
      amountCents: 100,
    });
  });
  it('marks the calendar exhausted on the final supported day', async () => {
    const { repo } = setup(
      rule({ startsOn: '9999-12-31', nextExecutionOn: '9999-12-31' }),
    );
    const service = createRecurrencesService(repo, {
      now: () => new Date('9999-12-31T15:00:00Z'),
    });
    expect(await service.process(userId)).toMatchObject({
      createdTransactions: 1,
    });
    expect(repo.update.mock.calls[0]?.[2].status).toBe('completed');
  });
});

describe('recurrence schemas', () => {
  const input = {
    accountId,
    categoryId,
    type: 'expense',
    description: 'Despesa fictícia',
    amountCents: 100,
    startsOn: '2026-01-01',
  };
  it('applies defaults to creates and preserves sparse patches', () => {
    expect(createRecurrenceSchema.parse(input)).toMatchObject({
      frequency: 'monthly',
      intervalCount: 1,
      status: 'active',
    });
    expect(updateRecurrenceSchema.parse({ amountCents: 200 })).toEqual({
      amountCents: 200,
    });
    expect(updateRecurrenceSchema.parse({ endsOn: null })).toEqual({
      endsOn: null,
    });
  });
  it.each([
    { endsOn: '2025-12-31' },
    { amountCents: 0 },
    { intervalCount: 0 },
    { intervalCount: 1201 },
    { frequency: 'hourly' },
    { status: 'deleted' },
    { startsOn: '2026-02-29' },
    { userId },
  ])('rejects invalid creates %j', (override) =>
    expect(
      createRecurrenceSchema.safeParse({ ...input, ...override }).success,
    ).toBe(false),
  );
  it.each([{}, { endsOn: undefined }, { unknown: true }])(
    'rejects empty or unknown patches %j',
    (patch) =>
      expect(updateRecurrenceSchema.safeParse(patch).success).toBe(false),
  );
  it('accepts filtered pagination and rejects unknown filters', () => {
    expect(
      recurrencesQuerySchema.parse({ status: 'active', accountId }),
    ).toMatchObject({ page: 1, pageSize: 20, status: 'active', accountId });
    expect(recurrencesQuerySchema.safeParse({ month: '2026-01' }).success).toBe(
      false,
    );
  });
  it('prevents callers from overriding the processing date', () => {
    expect(processRecurrencesSchema.parse({})).toEqual({});
    expect(
      processRecurrencesSchema.safeParse({ date: '2099-01-01' }).success,
    ).toBe(false);
  });
});
