import { describe, expect, it, vi } from 'vitest';
import type { Account, Transfer } from '../../src/db/schema/types.js';
import type { AccountsRepository } from '../../src/modules/accounts/repositories.js';
import {
  accountsQuerySchema,
  createAccountSchema,
  createTransferSchema,
  patchAccountSchema,
  transfersQuerySchema,
} from '../../src/modules/accounts/schemas.js';
import { createAccountsService } from '../../src/modules/accounts/services.js';
import { notFound } from '../../src/shared/api-error.js';

const userId = '10000000-0000-4000-8000-000000000001';
const id = '20000000-0000-4000-8000-000000000001';
const destination = '30000000-0000-4000-8000-000000000001';
const now = new Date('2026-01-01Z');
const account: Account = {
  id,
  userId,
  name: 'Conta Exemplo',
  type: 'checking',
  openingBalanceCents: -100,
  archivedAt: null,
  createdAt: now,
  updatedAt: now,
};
const transfer: Transfer = {
  id,
  userId,
  sourceAccountId: id,
  destinationAccountId: destination,
  amountCents: 500,
  occurredOn: '2026-01-02',
  description: null,
  createdAt: now,
  updatedAt: now,
};
const transferInput = createTransferSchema.parse({
  sourceAccountId: id,
  destinationAccountId: destination,
  amountCents: 500,
  occurredOn: '2026-01-02',
});
function setup() {
  const scope = {
    get: vi
      .fn<AccountsRepository['get']>()
      .mockResolvedValue({ account, balanceCents: '12345' }),
    create: vi.fn<AccountsRepository['create']>().mockResolvedValue(account),
    update: vi.fn<AccountsRepository['update']>().mockResolvedValue(account),
  };
  const transactionCalled = vi.fn<() => void>();
  const repository = {
    ...scope,
    async transaction<T>(
      work: (value: typeof scope) => Promise<T>,
    ): Promise<T> {
      transactionCalled();
      return work(scope);
    },
    list: vi.fn<AccountsRepository['list']>().mockResolvedValue({
      rows: [{ account, balanceCents: '12345' }],
      total: 5,
    }),
    delete: vi.fn<AccountsRepository['delete']>().mockResolvedValue({ id }),
    createTransfer: vi
      .fn<AccountsRepository['createTransfer']>()
      .mockResolvedValue(transfer),
    listTransfers: vi
      .fn<AccountsRepository['listTransfers']>()
      .mockResolvedValue({ rows: [transfer], total: 1 }),
  } satisfies AccountsRepository;
  return {
    scope,
    repository,
    transactionCalled,
    service: createAccountsService(repository),
  };
}

describe('account service', () => {
  it('presents the derived balance independently from the opening balance', async () => {
    const { service, repository } = setup();
    expect(await service.get(userId, id)).toEqual({
      ...account,
      balanceCents: 12345,
    });
    expect(repository.get).toHaveBeenCalledWith(userId, id);
  });
  it('paginates account DTOs and forwards filters', async () => {
    const { service, repository } = setup();
    const query = accountsQuerySchema.parse({
      page: 2,
      pageSize: 2,
      type: 'cash',
      order: 'desc',
    });
    expect(await service.list(userId, query)).toEqual({
      data: [{ ...account, balanceCents: 12345 }],
      pagination: { page: 2, pageSize: 2, total: 5, totalPages: 3 },
    });
    expect(repository.list).toHaveBeenCalledWith(userId, query);
  });
  it('creates and re-reads derived balances inside the transaction scope', async () => {
    const { service, transactionCalled, scope } = setup();
    const input = createAccountSchema.parse({ name: 'Nova', type: 'cash' });
    expect(await service.create(userId, input)).toMatchObject({
      balanceCents: 12345,
    });
    expect(transactionCalled).toHaveBeenCalledOnce();
    expect(scope.create).toHaveBeenCalledWith(userId, input);
    expect(scope.get).toHaveBeenCalledWith(userId, id);
  });
  it('updates and presents the newly derived balance inside the transaction', async () => {
    const { service, scope } = setup();
    expect(
      await service.update(userId, id, { openingBalanceCents: 0 }),
    ).toMatchObject({ balanceCents: 12345 });
    expect(scope.update).toHaveBeenCalledWith(userId, id, {
      openingBalanceCents: 0,
    });
    expect(scope.get).toHaveBeenCalledWith(userId, id);
  });
  it('reports an insert failure when persistence returns no account', async () => {
    const { service, scope } = setup();
    scope.create.mockResolvedValue(undefined);
    await expect(
      service.create(userId, {
        name: 'Nova',
        type: 'cash',
        openingBalanceCents: 0,
      }),
    ).rejects.toThrow('Account insert failed');
    expect(scope.get).not.toHaveBeenCalled();
  });
  it('returns 404 for a missing account on get', async () => {
    const { service, scope } = setup();
    scope.get.mockResolvedValue(undefined);
    await expect(service.get(userId, id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('returns 404 when the scoped update cannot find the account', async () => {
    const { service, scope } = setup();
    scope.update.mockResolvedValue(undefined);
    await expect(
      service.update(userId, id, { name: 'Novo nome' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(scope.get).not.toHaveBeenCalled();
  });
  it('returns 404 if the transactional re-read no longer finds the account', async () => {
    const { service, scope } = setup();
    scope.get.mockResolvedValue(undefined);
    await expect(
      service.create(userId, {
        name: 'Nova',
        type: 'cash',
        openingBalanceCents: 0,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('deletes within owner scope and returns a receipt', async () => {
    const { service, repository } = setup();
    expect(await service.delete(userId, id)).toEqual({ id, deleted: true });
    expect(repository.delete).toHaveBeenCalledWith(userId, id);
    repository.delete.mockResolvedValue(undefined);
    await expect(service.delete(userId, id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('delegates a transfer as one atomic repository operation', async () => {
    const { service, repository, transactionCalled } = setup();
    expect(await service.createTransfer(userId, transferInput)).toEqual(
      transfer,
    );
    expect(repository.createTransfer).toHaveBeenCalledExactlyOnceWith(
      userId,
      transferInput,
    );
    expect(repository.update).not.toHaveBeenCalled();
    expect(transactionCalled).not.toHaveBeenCalled();
  });
  it('preserves a transfer ownership rejection from persistence', async () => {
    const { service, repository } = setup();
    repository.createTransfer.mockRejectedValue(notFound());
    await expect(
      service.createTransfer(userId, transferInput),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('reports an unsuccessful transfer insert', async () => {
    const { service, repository } = setup();
    repository.createTransfer.mockResolvedValue(undefined);
    await expect(service.createTransfer(userId, transferInput)).rejects.toThrow(
      'Transfer insert failed',
    );
  });
  it('lists transfers without checking an absent account filter', async () => {
    const { service, repository } = setup();
    const query = transfersQuerySchema.parse({});
    expect(await service.listTransfers(userId, query)).toMatchObject({
      data: [transfer],
      pagination: { total: 1 },
    });
    expect(repository.get).not.toHaveBeenCalled();
    expect(repository.listTransfers).toHaveBeenCalledWith(userId, query);
  });
  it('checks ownership before listing transfers for an account', async () => {
    const { service, repository } = setup();
    const query = transfersQuerySchema.parse({ accountId: id });
    await service.listTransfers(userId, query);
    expect(repository.get).toHaveBeenCalledWith(userId, id);
    repository.get.mockResolvedValue(undefined);
    repository.listTransfers.mockClear();
    await expect(service.listTransfers(userId, query)).rejects.toMatchObject({
      status: 404,
    });
    expect(repository.listTransfers).not.toHaveBeenCalled();
  });
  it.each(['9007199254740992', '-9007199254740992', 'invalid'])(
    'rejects an unrepresentable derived balance %s',
    async (balanceCents) => {
      const { service, scope } = setup();
      scope.get.mockResolvedValue({ account, balanceCents });
      await expect(service.get(userId, id)).rejects.toMatchObject({
        status: 422,
      });
    },
  );
  it('preserves safe integer precision at the DTO boundary', async () => {
    const { service, scope } = setup();
    scope.get.mockResolvedValue({ account, balanceCents: '9007199254740991' });
    expect(await service.get(userId, id)).toMatchObject({
      balanceCents: Number.MAX_SAFE_INTEGER,
    });
  });
});
describe('account and transfer schemas', () => {
  it('defaults opening balance and accepts all account types', () => {
    for (const type of ['checking', 'savings', 'cash', 'investment', 'other'])
      expect(createAccountSchema.parse({ name: ' Exemplo ', type })).toEqual({
        name: 'Exemplo',
        type,
        openingBalanceCents: 0,
      });
    expect(
      createAccountSchema.parse({
        name: 'Exemplo',
        type: 'cash',
        openingBalanceCents: -100,
      }).openingBalanceCents,
    ).toBe(-100);
  });
  it.each([
    { name: ' ', type: 'cash' },
    { name: 'Exemplo', type: 'invalid' },
    { name: 'Exemplo', type: 'cash', openingBalanceCents: 1.5 },
    {
      name: 'Exemplo',
      type: 'cash',
      openingBalanceCents: Number.MAX_SAFE_INTEGER + 1,
    },
    { name: 'Exemplo', type: 'cash', balanceCents: 20 },
  ])('rejects invalid account case %#', (value) => {
    expect(createAccountSchema.safeParse(value).success).toBe(false);
  });
  it('accepts a zero balance patch and rejects empty/undefined patches', () => {
    expect(patchAccountSchema.parse({ openingBalanceCents: 0 })).toEqual({
      openingBalanceCents: 0,
    });
    expect(patchAccountSchema.safeParse({}).success).toBe(false);
    expect(patchAccountSchema.safeParse({ name: undefined }).success).toBe(
      false,
    );
  });
  it.each([
    { sourceAccountId: destination },
    { destinationAccountId: id },
    { amountCents: 0 },
    { amountCents: -1 },
    { occurredOn: '2026-02-30' },
    { sourceAccountId: 'invalid' },
  ])('rejects invalid transfer case %#', (changes) => {
    expect(
      createTransferSchema.safeParse({ ...transferInput, ...changes }).success,
    ).toBe(false);
  });
  it('trims optional transfer descriptions and enforces their length', () => {
    expect(
      createTransferSchema.parse({ ...transferInput, description: ' Exemplo ' })
        .description,
    ).toBe('Exemplo');
    expect(
      createTransferSchema.safeParse({
        ...transferInput,
        description: 'x'.repeat(501),
      }).success,
    ).toBe(false);
  });
  it('normalizes account pagination and validates transfer date intervals', () => {
    expect(accountsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      order: 'asc',
    });
    expect(transfersQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
      order: 'desc',
    });
    expect(transfersQuerySchema.parse({ from: '2026-01-01' }).from).toBe(
      '2026-01-01',
    );
    expect(transfersQuerySchema.parse({ to: '2026-01-31' }).to).toBe(
      '2026-01-31',
    );
    expect(
      transfersQuerySchema.safeParse({ from: '2026-02-01', to: '2026-01-01' })
        .success,
    ).toBe(false);
  });
});
