import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { registerClient } from '../support/client.js';
import {
  type Account,
  account,
  type Category,
  category,
  type Dashboard,
  error,
  hiddenCrud,
  ledger,
  type Transaction,
  transaction,
  transactionInput,
} from './fixtures.js';

describe('contas, categorias, lançamentos e transferências', () => {
  it('cria, consulta, altera e exclui conta sem dependências', async () => {
    const { client } = await registerClient();
    const a = await account(client, {
      name: '  Conta exemplo  ',
      openingBalanceCents: -500,
    });
    expect(a.name).toBe('Conta exemplo');
    expect(
      (await client.data<Account>('GET', `/api/accounts/${a.id}`)).balanceCents,
    ).toBe(-500);
    const updated = await client.data<Account>(
      'PATCH',
      `/api/accounts/${a.id}`,
      { name: 'Conta revisada', openingBalanceCents: 200 },
    );
    expect(updated.balanceCents).toBe(200);
    expect(await client.data('DELETE', `/api/accounts/${a.id}`)).toEqual({
      id: a.id,
      deleted: true,
    });
    await error(
      client,
      'GET',
      `/api/accounts/${a.id}`,
      undefined,
      404,
      'NOT_FOUND',
    );
  });

  it('filtra e pagina contas em ordem de nome', async () => {
    const { client } = await registerClient();
    for (const name of ['Alfa', 'Beta', 'Gama'])
      await account(client, { name, type: 'savings' });
    await account(client, { name: 'Conta fora', type: 'cash' });
    const result = await client.list<Account>(
      '/api/accounts?type=savings&order=desc&page=2&pageSize=2',
    );
    expect(result.data.map((row) => row.name)).toEqual(['Alfa']);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    expect((await client.list('/api/accounts?page=99')).data).toEqual([]);
  });

  it('isola GET/PATCH/DELETE e listagem de contas por proprietário', async () => {
    const owner = await registerClient();
    const stranger = await registerClient();
    const a = await account(owner.client);
    await hiddenCrud(stranger.client, `/api/accounts/${a.id}`, {
      name: 'Conta revisada',
    });
    expect((await stranger.client.list('/api/accounts')).data).toEqual([]);
    expect(
      (await owner.client.data<Account>('GET', `/api/accounts/${a.id}`)).name,
    ).toBe('Conta exemplo');
  });

  it('valida campos, PATCH vazio, UUIDs e paginação de contas', async () => {
    const { client } = await registerClient();
    const a = await account(client);
    for (const fields of [
      { name: '' },
      { type: 'invalid' },
      { openingBalanceCents: 1.5 },
      { openingBalanceCents: Number.MAX_SAFE_INTEGER + 1 },
      { archivedAt: null },
    ])
      await error(
        client,
        'POST',
        '/api/accounts',
        { name: 'Conta exemplo', type: 'cash', ...fields },
        400,
        'VALIDATION_ERROR',
      );
    await error(
      client,
      'PATCH',
      `/api/accounts/${a.id}`,
      {},
      400,
      'VALIDATION_ERROR',
    );
    for (const path of [
      '/api/accounts/not-a-uuid',
      '/api/accounts?page=0',
      '/api/accounts?pageSize=101',
      '/api/accounts?page=1&page=2',
      '/api/accounts?unknown=true',
    ])
      await error(client, 'GET', path, undefined, 400, 'VALIDATION_ERROR');
  });

  it('executa CRUD de categorias, busca, filtro e ordenação', async () => {
    const { client } = await registerClient();
    const c = await category(client, 'expense', '  Alfa exemplo  ');
    await category(client, 'expense', 'Beta exemplo');
    await category(client, 'income', 'Receita exemplo');
    expect(
      (await client.data<Category>('GET', `/api/categories/${c.id}`)).name,
    ).toBe('Alfa exemplo');
    const list = await client.list<Category>(
      '/api/categories?type=expense&search=exemplo&sortBy=name&order=desc&pageSize=1',
    );
    expect(list.data.map((row) => row.name)).toEqual(['Beta exemplo']);
    expect(list.pagination.total).toBe(2);
    expect(
      (
        await client.data<Category>('PATCH', `/api/categories/${c.id}`, {
          name: 'Categoria revisada',
        })
      ).name,
    ).toBe('Categoria revisada');
    await client.request('DELETE', `/api/categories/${c.id}`);
    await error(
      client,
      'GET',
      `/api/categories/${c.id}`,
      undefined,
      404,
      'NOT_FOUND',
    );
  });

  it('oculta GET/PATCH/DELETE de categorias de outro usuário', async () => {
    const owner = await registerClient();
    const stranger = await registerClient();
    const c = await category(owner.client);
    await hiddenCrud(stranger.client, `/api/categories/${c.id}`, {
      name: 'Categoria revisada',
    });
    expect((await stranger.client.list('/api/categories')).data).toEqual([]);
  });

  it('impede exclusão de conta/categoria usadas e troca incompatível de tipo', async () => {
    const { client } = await registerClient();
    const f = await ledger(client);
    await transaction(client, f.account, f.category);
    await error(
      client,
      'DELETE',
      `/api/accounts/${f.account.id}`,
      undefined,
      409,
      'CONFLICT',
    );
    await error(
      client,
      'DELETE',
      `/api/categories/${f.category.id}`,
      undefined,
      409,
      'CONFLICT',
    );
    await error(
      client,
      'PATCH',
      `/api/categories/${f.category.id}`,
      { type: 'income' },
      409,
      'CONFLICT',
    );
  });

  it('recalcula saldos após criar, editar, mover e excluir lançamento', async () => {
    const { client } = await registerClient();
    const f = await ledger(client);
    const destination = await account(client, { openingBalanceCents: 0 });
    const t = await transaction(client, f.account, f.category);
    expect(
      (await client.data<Account>('GET', `/api/accounts/${f.account.id}`))
        .balanceCents,
    ).toBe(8800);
    expect(
      (await client.data<Transaction>('GET', `/api/transactions/${t.id}`))
        .recurrenceId,
    ).toBeNull();
    await client.request('PATCH', `/api/transactions/${t.id}`, {
      amountCents: 2000,
      accountId: destination.id,
    });
    expect(
      (await client.data<Account>('GET', `/api/accounts/${f.account.id}`))
        .balanceCents,
    ).toBe(10000);
    expect(
      (await client.data<Account>('GET', `/api/accounts/${destination.id}`))
        .balanceCents,
    ).toBe(-2000);
    await client.request('DELETE', `/api/transactions/${t.id}`);
    expect(
      (await client.data<Account>('GET', `/api/accounts/${destination.id}`))
        .balanceCents,
    ).toBe(0);
  });

  it('filtra lançamentos por conta, categoria, tipo e datas inclusivas com paginação', async () => {
    const { client } = await registerClient();
    const f = await ledger(client);
    for (const [occurredOn, amountCents] of [
      ['2026-03-01', 100],
      ['2026-03-31', 300],
      ['2026-04-01', 200],
    ] as const)
      await transaction(client, f.account, f.category, {
        occurredOn,
        amountCents,
      });
    const result = await client.list<Transaction>(
      `/api/transactions?accountId=${f.account.id}&categoryId=${f.category.id}&type=expense&from=2026-03-01&to=2026-03-31&sortBy=amount&order=desc&pageSize=1`,
    );
    expect(result.data.map((row) => row.amountCents)).toEqual([300]);
    expect(result.pagination.total).toBe(2);
  });

  it('oculta operações e referências estrangeiras dos lançamentos', async () => {
    const owner = await registerClient();
    const stranger = await registerClient();
    const own = await ledger(owner.client);
    const other = await ledger(stranger.client);
    const t = await transaction(owner.client, own.account, own.category);
    const local = await transaction(
      stranger.client,
      other.account,
      other.category,
    );
    await hiddenCrud(stranger.client, `/api/transactions/${t.id}`, {
      amountCents: 100,
    });
    for (const fields of [
      { accountId: own.account.id },
      { categoryId: own.category.id },
    ]) {
      await error(
        stranger.client,
        'POST',
        '/api/transactions',
        transactionInput(other.account, other.category, fields),
        404,
        'NOT_FOUND',
      );
      await error(
        stranger.client,
        'PATCH',
        `/api/transactions/${local.id}`,
        fields,
        404,
        'NOT_FOUND',
      );
    }
    for (const query of [
      `accountId=${own.account.id}`,
      `categoryId=${own.category.id}`,
    ])
      await error(
        stranger.client,
        'GET',
        `/api/transactions?${query}`,
        undefined,
        404,
        'NOT_FOUND',
      );
    expect(
      (await stranger.client.list<Transaction>('/api/transactions')).data.map(
        (row) => row.id,
      ),
    ).toEqual([local.id]);
  });

  it('rejeita datas impossíveis, valores fracionários e categoria incompatível', async () => {
    const { client } = await registerClient();
    const f = await ledger(client);
    for (const fields of [
      { amountCents: 0 },
      { amountCents: 1.5 },
      { occurredOn: '2026-02-30' },
      { recurrenceId: randomUUID() },
    ])
      await error(
        client,
        'POST',
        '/api/transactions',
        transactionInput(f.account, f.category, fields),
        400,
        'VALIDATION_ERROR',
      );
    await error(
      client,
      'POST',
      '/api/transactions',
      transactionInput(f.account, f.category, { type: 'income' }),
      422,
      'BUSINESS_RULE',
    );
    await error(
      client,
      'GET',
      '/api/transactions?from=2026-04-01&to=2026-03-01',
      undefined,
      400,
      'VALIDATION_ERROR',
    );
    expect((await client.list('/api/transactions')).data).toEqual([]);
  });

  it('transfere atomicamente sem gerar receitas/despesas ou alterar saldo consolidado', async () => {
    const { client } = await registerClient();
    const source = await account(client, { openingBalanceCents: 1000 });
    const destination = await account(client, { openingBalanceCents: 2000 });
    await client.data(
      'POST',
      '/api/transfers',
      {
        sourceAccountId: source.id,
        destinationAccountId: destination.id,
        amountCents: 5000,
        occurredOn: '2026-03-31',
      },
      201,
    );
    expect(
      (await client.data<Account>('GET', `/api/accounts/${source.id}`))
        .balanceCents,
    ).toBe(-4000);
    expect(
      (await client.data<Account>('GET', `/api/accounts/${destination.id}`))
        .balanceCents,
    ).toBe(7000);
    const list = await client.list(
      `/api/transfers?accountId=${destination.id}&from=2026-03-31&to=2026-03-31&order=asc&pageSize=1`,
    );
    expect(list.pagination.total).toBe(1);
    expect((await client.list('/api/transactions')).pagination.total).toBe(0);
    expect(
      (await client.data<Dashboard>('GET', '/api/dashboard?month=2026-03'))
        .totals,
    ).toEqual({
      balanceCents: 3000,
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
    });
  });

  it('recusa transferência para mesma conta e contas/filtros estrangeiros sem efeitos', async () => {
    const owner = await registerClient();
    const stranger = await registerClient();
    const a = await account(owner.client);
    const b = await account(stranger.client);
    const input = {
      sourceAccountId: b.id,
      destinationAccountId: b.id,
      amountCents: 100,
      occurredOn: '2026-03-31',
    };
    await error(
      stranger.client,
      'POST',
      '/api/transfers',
      input,
      400,
      'VALIDATION_ERROR',
    );
    await error(
      stranger.client,
      'POST',
      '/api/transfers',
      { ...input, destinationAccountId: a.id },
      404,
      'NOT_FOUND',
    );
    await error(
      stranger.client,
      'POST',
      '/api/transfers',
      { ...input, sourceAccountId: a.id },
      404,
      'NOT_FOUND',
    );
    await error(
      stranger.client,
      'GET',
      `/api/transfers?accountId=${a.id}`,
      undefined,
      404,
      'NOT_FOUND',
    );
    expect((await stranger.client.list('/api/transfers')).data).toEqual([]);
    expect(
      (await owner.client.data<Account>('GET', `/api/accounts/${a.id}`))
        .balanceCents,
    ).toBe(10000);
  });
});
