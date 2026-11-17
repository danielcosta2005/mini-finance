import { describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../../src/db/schema/types.js';
import type { TransactionsRepository } from '../../src/modules/transactions/repositories.js';
import {
  createTransactionSchema,
  patchTransactionSchema,
  transactionsQuerySchema,
} from '../../src/modules/transactions/schemas.js';
import { createTransactionsService } from '../../src/modules/transactions/services.js';

const userId = '10000000-0000-4000-8000-000000000001';
const id = '20000000-0000-4000-8000-000000000001';
const accountId = '30000000-0000-4000-8000-000000000001';
const categoryId = '40000000-0000-4000-8000-000000000001';
const alternateId = '50000000-0000-4000-8000-000000000001';
const input = createTransactionSchema.parse({
  accountId,
  categoryId,
  type: 'expense',
  amountCents: 150,
  description: 'Exemplo',
  occurredOn: '2026-01-02',
});
const row: Transaction = {
  ...input,
  id,
  userId,
  recurrenceId: null,
  recurrenceOn: null,
  createdAt: new Date('2026-01-01Z'),
  updatedAt: new Date('2026-01-01Z'),
};
function setup() {
  const repository = {
    list: vi
      .fn<TransactionsRepository['list']>()
      .mockResolvedValue({ data: [row], total: 3 }),
    find: vi.fn<TransactionsRepository['find']>().mockResolvedValue(row),
    findAccount: vi
      .fn<TransactionsRepository['findAccount']>()
      .mockResolvedValue({ id: accountId }),
    findCategory: vi
      .fn<TransactionsRepository['findCategory']>()
      .mockResolvedValue({ id: categoryId, type: 'expense' }),
    create: vi.fn<TransactionsRepository['create']>().mockResolvedValue(row),
    update: vi.fn<TransactionsRepository['update']>().mockResolvedValue(row),
    delete: vi.fn<TransactionsRepository['delete']>().mockResolvedValue({ id }),
  } satisfies TransactionsRepository;
  return { repository, service: createTransactionsService(repository) };
}

describe('transaction service', () => {
  it('paginates monetary DTOs without unnecessary reference lookups', async () => {
    const { service, repository } = setup();
    const query = transactionsQuerySchema.parse({ page: 2, pageSize: 2 });
    expect(await service.list(userId, query)).toEqual({
      data: [row],
      pagination: { page: 2, pageSize: 2, total: 3, totalPages: 2 },
    });
    expect(repository.list).toHaveBeenCalledWith(userId, query);
    expect(repository.findAccount).not.toHaveBeenCalled();
    expect(repository.findCategory).not.toHaveBeenCalled();
  });
  it('validates both list reference filters within owner scope', async () => {
    const { service, repository } = setup();
    await service.list(
      userId,
      transactionsQuerySchema.parse({ accountId, categoryId }),
    );
    expect(repository.findAccount).toHaveBeenCalledWith(userId, accountId);
    expect(repository.findCategory).toHaveBeenCalledWith(userId, categoryId);
  });
  it.each(['account', 'category'] as const)(
    'rejects a nonowned %s list filter before listing',
    async (reference) => {
      const { service, repository } = setup();
      if (reference === 'account')
        repository.findAccount.mockResolvedValue(undefined);
      else repository.findCategory.mockResolvedValue(undefined);
      await expect(
        service.list(
          userId,
          transactionsQuerySchema.parse({ accountId, categoryId }),
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.list).not.toHaveBeenCalled();
    },
  );
  it('gets an owned transaction and rejects a missing one', async () => {
    const { service, repository } = setup();
    expect(await service.get(userId, id)).toEqual(row);
    expect(repository.find).toHaveBeenCalledWith(userId, id);
    repository.find.mockResolvedValue(undefined);
    await expect(service.get(userId, id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('checks references before creating a transaction', async () => {
    const { service, repository } = setup();
    expect(await service.create(userId, input)).toEqual(row);
    expect(repository.findAccount).toHaveBeenCalledWith(userId, accountId);
    expect(repository.findCategory).toHaveBeenCalledWith(userId, categoryId);
    expect(repository.create).toHaveBeenCalledWith(userId, input);
  });
  it.each(['account', 'category'] as const)(
    'rejects a missing or foreign %s on create',
    async (reference) => {
      const { service, repository } = setup();
      if (reference === 'account')
        repository.findAccount.mockResolvedValue(undefined);
      else repository.findCategory.mockResolvedValue(undefined);
      await expect(service.create(userId, input)).rejects.toMatchObject({
        status: 404,
      });
      expect(repository.create).not.toHaveBeenCalled();
    },
  );
  it('rejects an incompatible category type with 422', async () => {
    const { service, repository } = setup();
    repository.findCategory.mockResolvedValue({
      id: categoryId,
      type: 'income',
    });
    await expect(service.create(userId, input)).rejects.toMatchObject({
      status: 422,
      code: 'BUSINESS_RULE',
    });
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('returns 404 if a validated create has no returned row', async () => {
    const { service, repository } = setup();
    repository.create.mockResolvedValue(undefined);
    await expect(service.create(userId, input)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('merges omitted patch references from the persisted transaction', async () => {
    const { service, repository } = setup();
    const patch = { description: 'Alteração fictícia', amountCents: 200 };
    repository.update.mockResolvedValue({ ...row, ...patch });
    expect(await service.update(userId, id, patch)).toEqual({
      ...row,
      ...patch,
    });
    expect(repository.findAccount).toHaveBeenCalledWith(userId, accountId);
    expect(repository.findCategory).toHaveBeenCalledWith(userId, categoryId);
    expect(repository.update).toHaveBeenCalledWith(userId, id, patch);
  });
  it('merges replacement account/category/type before validating a patch', async () => {
    const { service, repository } = setup();
    repository.findCategory.mockResolvedValue({
      id: alternateId,
      type: 'income',
    });
    const patch = patchTransactionSchema.parse({
      accountId: alternateId,
      categoryId: alternateId,
      type: 'income',
      occurredOn: '2026-02-01',
    });
    await service.update(userId, id, patch);
    expect(repository.findAccount).toHaveBeenCalledWith(userId, alternateId);
    expect(repository.findCategory).toHaveBeenCalledWith(userId, alternateId);
    expect(repository.update).toHaveBeenCalledWith(userId, id, patch);
  });
  it('rejects a type-only patch incompatible with the existing category', async () => {
    const { service, repository } = setup();
    await expect(
      service.update(userId, id, { type: 'income' }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('rejects missing transactions before checking patch references', async () => {
    const { service, repository } = setup();
    repository.find.mockResolvedValue(undefined);
    await expect(
      service.update(userId, id, { description: 'Exemplo' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.findAccount).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('returns 404 when a transaction disappears before update', async () => {
    const { service, repository } = setup();
    repository.update.mockResolvedValue(undefined);
    await expect(
      service.update(userId, id, { amountCents: 200 }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('deletes within owner scope and rejects a missing transaction', async () => {
    const { service, repository } = setup();
    expect(await service.delete(userId, id)).toEqual({ id, deleted: true });
    expect(repository.delete).toHaveBeenCalledWith(userId, id);
    repository.delete.mockResolvedValue(undefined);
    await expect(service.delete(userId, id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('rejects unsafe repository monetary output', async () => {
    const { service, repository } = setup();
    repository.find.mockResolvedValue({
      ...row,
      amountCents: Number.MAX_SAFE_INTEGER + 1,
    });
    await expect(service.get(userId, id)).rejects.toMatchObject({
      status: 422,
    });
  });
});
describe('transaction schemas', () => {
  it('trims descriptions and accepts the largest safe integer amount', () => {
    expect(
      createTransactionSchema.parse({
        ...input,
        description: ' Exemplo ',
        amountCents: Number.MAX_SAFE_INTEGER,
      }),
    ).toMatchObject({
      description: 'Exemplo',
      amountCents: Number.MAX_SAFE_INTEGER,
    });
  });
  it.each([
    { amountCents: 0 },
    { amountCents: -1 },
    { amountCents: 1.1 },
    { amountCents: '100' },
    { accountId: 'invalid' },
    { categoryId: 'invalid' },
    { type: 'transfer' },
    { occurredOn: '2026-02-30' },
    { occurredOn: '0000-01-01' },
    { description: ' ' },
    { description: 'x'.repeat(501) },
    { userId },
  ])('rejects invalid transaction case %#', (changes) => {
    expect(
      createTransactionSchema.safeParse({ ...input, ...changes }).success,
    ).toBe(false);
  });
  it('requires a meaningful patch and rejects protected fields', () => {
    expect(patchTransactionSchema.safeParse({}).success).toBe(false);
    expect(
      patchTransactionSchema.safeParse({ amountCents: undefined }).success,
    ).toBe(false);
    expect(patchTransactionSchema.safeParse({ userId }).success).toBe(false);
    expect(patchTransactionSchema.parse({ amountCents: 10 })).toEqual({
      amountCents: 10,
    });
  });
  it('supplies defaults and parses supported query filters', () => {
    expect(transactionsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      sortBy: 'date',
      order: 'desc',
    });
    expect(
      transactionsQuerySchema.parse({
        page: '2',
        pageSize: '5',
        from: '2026-01-01',
        to: '2026-01-31',
        type: 'income',
        sortBy: 'amount',
        order: 'asc',
      }),
    ).toMatchObject({
      page: 2,
      pageSize: 5,
      type: 'income',
      sortBy: 'amount',
      order: 'asc',
    });
    expect(
      transactionsQuerySchema.safeParse({
        from: '2026-02-01',
        to: '2026-01-01',
      }).success,
    ).toBe(false);
  });
});
