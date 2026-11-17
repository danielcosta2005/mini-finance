import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { registerClient } from '../support/client.js';
import {
  type Account,
  account,
  type Budget,
  type Contribution,
  card,
  category,
  type Dashboard,
  error,
  type Goal,
  goal,
  hiddenCrud,
  type Item,
  ledger,
  type ProcessResult,
  purchaseInput,
  type Recurrence,
  recurrence,
  recurrenceInput,
  type Transaction,
  transaction,
} from './fixtures.js';

describe('orçamentos e resumo por competência', () => {
  it('executa CRUD de orçamento, unicidade e filtros', async () => {
    const { client } = await registerClient();
    const c = await category(client);
    const input = { categoryId: c.id, month: '2026-03', limitCents: 1000 };
    const b = await client.data<Budget>('POST', '/api/budgets', input, 201);
    await error(client, 'POST', '/api/budgets', input, 409, 'CONFLICT');
    expect(
      (await client.data<Budget>('GET', `/api/budgets/${b.id}`)).month,
    ).toBe('2026-03');
    expect(
      (
        await client.data<Budget>('PATCH', `/api/budgets/${b.id}`, {
          limitCents: 2000,
        })
      ).limitCents,
    ).toBe(2000);
    const result = await client.list(
      `/api/budgets?month=2026-03&categoryId=${c.id}&sortBy=limit&order=asc&pageSize=1`,
    );
    expect(result.pagination.total).toBe(1);
    expect((await client.list('/api/budgets?month=2026-04')).data).toEqual([]);
    await client.request('DELETE', `/api/budgets/${b.id}`);
    expect((await client.list('/api/budgets')).data).toEqual([]);
  });

  it('calcula consumo excedido com despesa direta e parcela na competência do vencimento', async () => {
    const { client } = await registerClient();
    const f = await ledger(client);
    const cc = await card(client, { closingDay: 31, dueDay: 5 });
    const b = await client.data<Budget>(
      'POST',
      '/api/budgets',
      { categoryId: f.category.id, month: '2026-03', limitCents: 1000 },
      201,
    );
    await transaction(client, f.account, f.category, { amountCents: 500 });
    await transaction(client, f.account, f.category, {
      amountCents: 777,
      occurredOn: '2026-02-28',
    });
    await client.data(
      'POST',
      `/api/cards/${cc.id}/purchases`,
      purchaseInput(f.category, {
        totalCents: 1000,
        installmentCount: 1,
        purchasedOn: '2026-02-28',
      }),
      201,
    );
    expect(
      await client.data<Budget>('GET', `/api/budgets/${b.id}`),
    ).toMatchObject({
      spentCents: 1500,
      remainingCents: -500,
      percentageUsed: '150.00',
      exceeded: true,
    });
    const dashboard = await client.data<Dashboard>(
      'GET',
      '/api/dashboard?month=2026-03',
    );
    expect(dashboard.totals.expenseCents).toBe(1500);
    expect(dashboard.budgets).toMatchObject({
      spentCents: 1500,
      progressPercentage: '150.00',
      overBudgetCount: 1,
    });
  });

  it('oculta orçamento e categoria de outro usuário em operações e filtros', async () => {
    const owner = await registerClient();
    const stranger = await registerClient();
    const c = await category(owner.client);
    const local = await category(stranger.client);
    const b = await owner.client.data<Item>(
      'POST',
      '/api/budgets',
      { categoryId: c.id, month: '2026-03', limitCents: 1000 },
      201,
    );
    const own = await stranger.client.data<Item>(
      'POST',
      '/api/budgets',
      { categoryId: local.id, month: '2026-03', limitCents: 1000 },
      201,
    );
    await hiddenCrud(stranger.client, `/api/budgets/${b.id}`, {
      limitCents: 2000,
    });
    await error(
      stranger.client,
      'POST',
      '/api/budgets',
      { categoryId: c.id, month: '2026-03', limitCents: 1000 },
      404,
      'NOT_FOUND',
    );
    await error(
      stranger.client,
      'PATCH',
      `/api/budgets/${own.id}`,
      { categoryId: c.id },
      404,
      'NOT_FOUND',
    );
    await error(
      stranger.client,
      'GET',
      `/api/budgets?categoryId=${c.id}`,
      undefined,
      404,
      'NOT_FOUND',
    );
  });

  it('rejeita orçamento de receita e competência/limite inválidos', async () => {
    const { client } = await registerClient();
    const c = await category(client, 'income');
    const input = { categoryId: c.id, month: '2026-03', limitCents: 1000 };
    await error(client, 'POST', '/api/budgets', input, 422, 'BUSINESS_RULE');
    for (const fields of [
      { month: '2026-13' },
      { limitCents: 0 },
      { limitCents: -1 },
    ])
      await error(
        client,
        'POST',
        '/api/budgets',
        { ...input, ...fields },
        400,
        'VALIDATION_ERROR',
      );
  });

  it('resume receitas/despesas, percentuais por tipo e evolução de 12 meses', async () => {
    const { client } = await registerClient();
    const f = await ledger(client);
    const income = await category(client, 'income');
    await transaction(client, f.account, income, {
      type: 'income',
      amountCents: 4000,
    });
    await transaction(client, f.account, f.category, { amountCents: 1000 });
    await transaction(client, f.account, income, {
      type: 'income',
      amountCents: 500,
      occurredOn: '2026-02-28',
    });
    const result = await client.data<Dashboard>(
      'GET',
      '/api/dashboard?month=2026-03',
    );
    expect(result.totals).toEqual({
      balanceCents: 13500,
      incomeCents: 4000,
      expenseCents: 1000,
      netCents: 3000,
    });
    expect(result.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryId: income.id,
          amountCents: 4000,
          percentage: '100.00',
        }),
        expect.objectContaining({
          categoryId: f.category.id,
          amountCents: 1000,
          percentage: '100.00',
        }),
      ]),
    );
    expect(result.evolution).toHaveLength(12);
    expect(result.evolution[0]?.month).toBe('2025-04');
    expect(result.evolution.at(-1)).toMatchObject({
      month: '2026-03',
      netCents: 3000,
    });
    expect((await client.data<Dashboard>('GET', '/api/dashboard')).month).toBe(
      '2026-03',
    );
  });

  it('isola dashboard e limita evolução ao calendário representável', async () => {
    const owner = await registerClient();
    const stranger = await registerClient();
    const f = await ledger(owner.client);
    await transaction(owner.client, f.account, f.category);
    const result = await stranger.client.data<Dashboard>(
      'GET',
      '/api/dashboard?month=0001-01',
    );
    expect(result.totals).toEqual({
      balanceCents: 0,
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
    });
    expect(result.evolution).toEqual([
      { month: '0001-01', incomeCents: 0, expenseCents: 0, netCents: 0 },
    ]);
    await error(
      stranger.client,
      'GET',
      '/api/dashboard?month=2026-00',
      undefined,
      400,
      'VALIDATION_ERROR',
    );
    await error(
      stranger.client,
      'GET',
      '/api/dashboard?page=1',
      undefined,
      400,
      'VALIDATION_ERROR',
    );
  });
});

describe('metas e contribuições sem movimentação bancária', () => {
  it('executa CRUD de meta, filtra datas e pagina resultados', async () => {
    const { client } = await registerClient();
    const g = await goal(client);
    expect(
      (await client.data<Goal>('GET', `/api/goals/${g.id}`)).contributedCents,
    ).toBe(0);
    expect(
      (
        await client.data<Goal>('PATCH', `/api/goals/${g.id}`, {
          targetCents: 20000,
        })
      ).targetCents,
    ).toBe(20000);
    expect(
      (await client.list('/api/goals?from=2026-06-30&to=2026-06-30&pageSize=1'))
        .pagination.total,
    ).toBe(1);
    expect((await client.list('/api/goals?to=2026-06-29')).data).toEqual([]);
    await client.request('DELETE', `/api/goals/${g.id}`);
    await error(
      client,
      'GET',
      `/api/goals/${g.id}`,
      undefined,
      404,
      'NOT_FOUND',
    );
  });

  it('calcula progresso, prazo e contribuições acima do alvo sem alterar contas', async () => {
    const { client } = await registerClient();
    const a = await account(client);
    const g = await goal(client, { targetCents: 1000, dueOn: '2026-03-30' });
    expect(g.overdue).toBe(true);
    const first = await client.data<Contribution>(
      'POST',
      `/api/goals/${g.id}/contributions`,
      { amountCents: 250 },
      201,
    );
    expect(first.contributedOn).toBe('2026-03-31');
    expect(await client.data<Goal>('GET', `/api/goals/${g.id}`)).toMatchObject({
      contributedCents: 250,
      remainingCents: 750,
      progressPercentage: '25.00',
      achieved: false,
      overdue: true,
    });
    await client.data(
      'POST',
      `/api/goals/${g.id}/contributions`,
      { amountCents: 1000, contributedOn: '2026-03-15' },
      201,
    );
    expect(await client.data<Goal>('GET', `/api/goals/${g.id}`)).toMatchObject({
      contributedCents: 1250,
      remainingCents: 0,
      progressPercentage: '125.00',
      achieved: true,
      overdue: false,
    });
    expect(
      (await client.data<Account>('GET', `/api/accounts/${a.id}`)).balanceCents,
    ).toBe(10000);
    expect((await client.list('/api/transactions')).data).toEqual([]);
    await error(
      client,
      'DELETE',
      `/api/goals/${g.id}`,
      undefined,
      409,
      'CONFLICT',
    );
  });

  it('filtra contribuições por datas inclusivas e pagina sem misturar metas', async () => {
    const { client } = await registerClient();
    const g = await goal(client);
    const other = await goal(client);
    for (const contributedOn of ['2026-03-01', '2026-03-31', '2026-04-01'])
      await client.data(
        'POST',
        `/api/goals/${g.id}/contributions`,
        { amountCents: 100, contributedOn },
        201,
      );
    await client.data(
      'POST',
      `/api/goals/${other.id}/contributions`,
      { amountCents: 999 },
      201,
    );
    const result = await client.list<Contribution>(
      `/api/goals/${g.id}/contributions?from=2026-03-01&to=2026-03-31&pageSize=1&page=2`,
    );
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(result.data[0]?.amountCents).toBe(100);
  });

  it('oculta GET/PATCH/DELETE e contribuições de meta estrangeira', async () => {
    const owner = await registerClient();
    const stranger = await registerClient();
    const g = await goal(owner.client);
    await hiddenCrud(stranger.client, `/api/goals/${g.id}`, {
      targetCents: 20000,
    });
    await error(
      stranger.client,
      'GET',
      `/api/goals/${g.id}/contributions`,
      undefined,
      404,
      'NOT_FOUND',
    );
    await error(
      stranger.client,
      'POST',
      `/api/goals/${g.id}/contributions`,
      { amountCents: 100 },
      404,
      'NOT_FOUND',
    );
    expect((await stranger.client.list('/api/goals')).data).toEqual([]);
  });

  it('valida prazo, valor e corpo estrito de metas e contribuições', async () => {
    const { client } = await registerClient();
    const g = await goal(client, { dueOn: '2026-03-31' });
    expect(g.overdue).toBe(false);
    await error(
      client,
      'PATCH',
      `/api/goals/${g.id}`,
      {},
      400,
      'VALIDATION_ERROR',
    );
    await error(
      client,
      'PATCH',
      `/api/goals/${g.id}`,
      { dueOn: '2026-02-29' },
      400,
      'VALIDATION_ERROR',
    );
    await error(
      client,
      'POST',
      `/api/goals/${g.id}/contributions`,
      { amountCents: -1 },
      400,
      'VALIDATION_ERROR',
    );
    await error(
      client,
      'POST',
      `/api/goals/${g.id}/contributions`,
      { amountCents: 100, accountId: randomUUID() },
      400,
      'VALIDATION_ERROR',
    );
    await error(
      client,
      'GET',
      '/api/goals?from=2026-04-01&to=2026-03-01',
      undefined,
      400,
      'VALIDATION_ERROR',
    );
  });
});

describe('recorrências processadas pelo relógio do servidor', () => {
  it('executa CRUD de recorrência sem lançamentos e filtra referências/status', async () => {
    const { client } = await registerClient();
    const f = await ledger(client);
    const r = await recurrence(client, f.account, f.category, {
      startsOn: '2026-04-01',
    });
    expect(
      (await client.data<Recurrence>('GET', `/api/recurrences/${r.id}`))
        .nextExecutionOn,
    ).toBe('2026-04-01');
    expect(
      (
        await client.data<Recurrence>('PATCH', `/api/recurrences/${r.id}`, {
          amountCents: 500,
          status: 'paused',
        })
      ).amountCents,
    ).toBe(500);
    const result = await client.list(
      `/api/recurrences?accountId=${f.account.id}&categoryId=${f.category.id}&type=expense&status=paused&pageSize=1`,
    );
    expect(result.pagination.total).toBe(1);
    await client.request('DELETE', `/api/recurrences/${r.id}`);
    await error(
      client,
      'GET',
      `/api/recurrences/${r.id}`,
      undefined,
      404,
      'NOT_FOUND',
    );
  });

  it('materializa janeiro/fevereiro/março preservando âncora 31 e deduplica repetição', async () => {
    const { client } = await registerClient();
    const f = await ledger(client);
    const r = await recurrence(client, f.account, f.category);
    const result = await client.data<ProcessResult>(
      'POST',
      '/api/recurrences/process',
      {},
    );
    expect(result).toMatchObject({
      processedRules: 1,
      processedOccurrences: 3,
      createdTransactions: 3,
      more: false,
    });
    const list = await client.list<Transaction>(
      '/api/transactions?sortBy=date&order=asc',
    );
    expect(list.data.map((row) => row.occurredOn)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
    expect(
      list.data.every(
        (row) =>
          row.recurrenceId === r.id && row.recurrenceOn === row.occurredOn,
      ),
    ).toBe(true);
    expect(
      (await client.data<Recurrence>('GET', `/api/recurrences/${r.id}`))
        .nextExecutionOn,
    ).toBe('2026-04-30');
    expect(
      (await client.data<ProcessResult>('POST', '/api/recurrences/process', {}))
        .createdTransactions,
    ).toBe(0);
    expect(
      (await client.data<Account>('GET', `/api/accounts/${f.account.id}`))
        .balanceCents,
    ).toBe(6400);
    await error(
      client,
      'DELETE',
      `/api/recurrences/${r.id}`,
      undefined,
      409,
      'CONFLICT',
    );
  });

  it('não processa regras pausadas, concluídas ou futuras e retoma regra pausada', async () => {
    const { client } = await registerClient();
    const f = await ledger(client);
    const paused = await recurrence(client, f.account, f.category, {
      status: 'paused',
      startsOn: '2026-03-31',
    });
    await recurrence(client, f.account, f.category, { status: 'completed' });
    await recurrence(client, f.account, f.category, { startsOn: '2026-04-01' });
    expect(
      (await client.data<ProcessResult>('POST', '/api/recurrences/process', {}))
        .createdTransactions,
    ).toBe(0);
    await client.request('PATCH', `/api/recurrences/${paused.id}`, {
      status: 'active',
    });
    expect(
      (await client.data<ProcessResult>('POST', '/api/recurrences/process', {}))
        .createdTransactions,
    ).toBe(1);
    expect((await client.list('/api/transactions')).pagination.total).toBe(1);
  });

  it('encerra regra com endsOn inclusivo sem gerar ocorrências posteriores', async () => {
    const { client } = await registerClient();
    const f = await ledger(client);
    const r = await recurrence(client, f.account, f.category, {
      startsOn: '2026-03-29',
      endsOn: '2026-03-30',
      frequency: 'daily',
    });
    expect(
      (await client.data<ProcessResult>('POST', '/api/recurrences/process', {}))
        .createdTransactions,
    ).toBe(2);
    expect(
      await client.data<Recurrence>('GET', `/api/recurrences/${r.id}`),
    ).toMatchObject({ status: 'completed', nextExecutionOn: '2026-03-31' });
    expect(
      (await client.list<Transaction>('/api/transactions?order=asc')).data.map(
        (row) => row.occurredOn,
      ),
    ).toEqual(['2026-03-29', '2026-03-30']);
  });

  it('processamentos concorrentes não duplicam ocorrência e convergem sem pendências', async () => {
    const { client } = await registerClient();
    const f = await ledger(client);
    await recurrence(client, f.account, f.category);
    await Promise.all([
      client.request('POST', '/api/recurrences/process', {}),
      client.request('POST', '/api/recurrences/process', {}),
    ]);
    const final = await client.data<ProcessResult>(
      'POST',
      '/api/recurrences/process',
      {},
    );
    expect(final.more).toBe(false);
    expect(final.createdTransactions).toBe(0);
    const rows = (await client.list<Transaction>('/api/transactions')).data;
    expect(rows).toHaveLength(3);
    expect(
      new Set(rows.map((row) => `${row.recurrenceId}:${row.recurrenceOn}`))
        .size,
    ).toBe(3);
  });

  it('edita valor futuro sem reescrever lançamentos anteriores e preserva cursor', async () => {
    const { client } = await registerClient();
    const f = await ledger(client);
    const r = await recurrence(client, f.account, f.category);
    await client.request('POST', '/api/recurrences/process', {});
    await client.request('PATCH', `/api/recurrences/${r.id}`, {
      amountCents: 500,
      description: 'Despesa revisada',
      intervalCount: 2,
    });
    expect(
      (await client.list<Transaction>('/api/transactions')).data.every(
        (row) => row.amountCents === 1200,
      ),
    ).toBe(true);
    expect(
      (await client.data<Recurrence>('GET', `/api/recurrences/${r.id}`))
        .nextExecutionOn,
    ).toBe('2026-05-31');
    expect(
      (await client.data<ProcessResult>('POST', '/api/recurrences/process', {}))
        .createdTransactions,
    ).toBe(0);
  });

  it('oculta regras e referências estrangeiras em CRUD, filtros e processamento', async () => {
    const owner = await registerClient();
    const stranger = await registerClient();
    const foreign = await ledger(owner.client);
    const local = await ledger(stranger.client);
    const r = await recurrence(owner.client, foreign.account, foreign.category);
    const own = await recurrence(
      stranger.client,
      local.account,
      local.category,
      { status: 'paused' },
    );
    await hiddenCrud(stranger.client, `/api/recurrences/${r.id}`, {
      amountCents: 100,
    });
    for (const fields of [
      { accountId: foreign.account.id },
      { categoryId: foreign.category.id },
    ]) {
      await error(
        stranger.client,
        'POST',
        '/api/recurrences',
        recurrenceInput(local.account, local.category, fields),
        404,
        'NOT_FOUND',
      );
      await error(
        stranger.client,
        'PATCH',
        `/api/recurrences/${own.id}`,
        fields,
        404,
        'NOT_FOUND',
      );
    }
    for (const query of [
      `accountId=${foreign.account.id}`,
      `categoryId=${foreign.category.id}`,
    ])
      await error(
        stranger.client,
        'GET',
        `/api/recurrences?${query}`,
        undefined,
        404,
        'NOT_FOUND',
      );
    expect(
      (
        await stranger.client.data<ProcessResult>(
          'POST',
          '/api/recurrences/process',
          {},
        )
      ).createdTransactions,
    ).toBe(0);
    expect((await owner.client.list('/api/transactions')).data).toEqual([]);
  });

  it('rejeita datas de referência fornecidas pelo cliente e alterações inválidas de agenda', async () => {
    const { client } = await registerClient();
    const f = await ledger(client);
    const r = await recurrence(client, f.account, f.category, {
      startsOn: '2026-04-01',
    });
    for (const body of [
      { now: '2099-01-01' },
      { referenceDate: '2099-01-01' },
      { nextExecutionOn: '2099-01-01' },
    ])
      await error(
        client,
        'POST',
        '/api/recurrences/process',
        body,
        400,
        'VALIDATION_ERROR',
      );
    await error(
      client,
      'POST',
      '/api/recurrences/process?now=2099-01-01',
      {},
      400,
      'VALIDATION_ERROR',
    );
    for (const fields of [
      { intervalCount: 0 },
      { intervalCount: 1201 },
      { startsOn: '2026-02-30' },
      { status: 'cancelled' },
      { nextExecutionOn: '2026-05-01' },
    ])
      await error(
        client,
        'PATCH',
        `/api/recurrences/${r.id}`,
        fields,
        400,
        'VALIDATION_ERROR',
      );
    await error(
      client,
      'PATCH',
      `/api/recurrences/${r.id}`,
      { endsOn: '2026-03-31' },
      422,
      'BUSINESS_RULE',
    );
    await error(
      client,
      'POST',
      '/api/recurrences',
      recurrenceInput(f.account, f.category, { type: 'income' }),
      422,
      'BUSINESS_RULE',
    );
    expect((await client.list('/api/transactions')).data).toEqual([]);
  });
});
