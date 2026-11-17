import { describe, expect, it } from 'vitest';
import { database, registerClient } from '../support/client.js';
import {
  type Account,
  type Budget,
  type Card,
  card,
  category,
  type Dashboard,
  error,
  hiddenCrud,
  type Invoice,
  invoiceFixture,
  type Purchase,
  purchaseInput,
} from './fixtures.js';

describe('cartões, parcelas, calendário e quitação', () => {
  it('executa CRUD de cartão sem histórico e valida limites e dias', async () => {
    const { client } = await registerClient();
    const cc = await card(client, { creditLimitCents: 0 });
    expect(
      (await client.data<Card>('GET', `/api/cards/${cc.id}`)).availableCents,
    ).toBe(0);
    expect((await client.list('/api/cards?pageSize=1')).pagination.total).toBe(
      1,
    );
    expect(
      (
        await client.data<Card>('PATCH', `/api/cards/${cc.id}`, {
          closingDay: 31,
          dueDay: 5,
        })
      ).closingDay,
    ).toBe(31);
    for (const fields of [
      { creditLimitCents: -1 },
      { closingDay: 0 },
      { dueDay: 32 },
    ])
      await error(
        client,
        'PATCH',
        `/api/cards/${cc.id}`,
        fields,
        400,
        'VALIDATION_ERROR',
      );
    await client.request('DELETE', `/api/cards/${cc.id}`);
    await error(
      client,
      'GET',
      `/api/cards/${cc.id}`,
      undefined,
      404,
      'NOT_FOUND',
    );
  });

  it('divide 10001 centavos em três parcelas e preserva a soma exata', async () => {
    const { client } = await registerClient();
    const c = await category(client);
    const cc = await card(client);
    const p = await client.data<Purchase>(
      'POST',
      `/api/cards/${cc.id}/purchases`,
      purchaseInput(c),
      201,
    );
    expect(p.installments.map((part) => part.amountCents)).toEqual([
      3334, 3334, 3333,
    ]);
    expect(p.installments.map((part) => part.installmentNumber)).toEqual([
      1, 2, 3,
    ]);
    expect(
      p.installments.reduce((sum, part) => sum + part.amountCents, 0),
    ).toBe(p.totalCents);
    const invoices = await client.list<Invoice>(`/api/cards/${cc.id}/invoices`);
    expect(invoices.data.map((row) => row.period).sort()).toEqual([
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
    ]);
    const purchases = await client.list(
      `/api/cards/${cc.id}/purchases?from=2026-03-20&to=2026-03-20&categoryId=${c.id}&pageSize=1`,
    );
    expect(purchases.pagination.total).toBe(1);
    expect(
      (await client.list(`/api/cards/${cc.id}/purchases?from=2026-03-21`)).data,
    ).toEqual([]);
  });

  it('inclui dia de fechamento e desloca compra do dia seguinte', async () => {
    const { client } = await registerClient();
    const c = await category(client);
    const cc = await card(client);
    for (const purchasedOn of ['2026-03-20', '2026-03-21'])
      await client.data(
        'POST',
        `/api/cards/${cc.id}/purchases`,
        purchaseInput(c, { purchasedOn, totalCents: 100, installmentCount: 1 }),
        201,
      );
    const march = await client.list<Invoice>(
      `/api/cards/${cc.id}/invoices?month=2026-03`,
    );
    expect(march.data).toEqual([
      expect.objectContaining({
        period: '2026-03-01',
        closesOn: '2026-03-20',
        dueOn: '2026-03-28',
        totalCents: 100,
      }),
    ]);
    const april = await client.list<Invoice>(
      `/api/cards/${cc.id}/invoices?month=2026-04`,
    );
    expect(april.data[0]).toMatchObject({
      closesOn: '2026-04-20',
      dueOn: '2026-04-28',
      totalCents: 100,
    });
  });

  it('ajusta fevereiro para 28 dias sem perder âncora nominal e cruza o ano', async () => {
    const { client } = await registerClient();
    const c = await category(client);
    const cc = await card(client, { closingDay: 31, dueDay: 5 });
    await client.data(
      'POST',
      `/api/cards/${cc.id}/purchases`,
      purchaseInput(c, { purchasedOn: '2025-12-31' }),
      201,
    );
    const invoices = (
      await client.list<Invoice>(`/api/cards/${cc.id}/invoices`)
    ).data.sort((a, b) => a.period.localeCompare(b.period));
    expect(
      invoices.map(({ period, closesOn, dueOn }) => ({
        period,
        closesOn,
        dueOn,
      })),
    ).toEqual([
      { period: '2026-01-01', closesOn: '2025-12-31', dueOn: '2026-01-05' },
      { period: '2026-02-01', closesOn: '2026-01-31', dueOn: '2026-02-05' },
      { period: '2026-03-01', closesOn: '2026-02-28', dueOn: '2026-03-05' },
    ]);
  });

  it('preserva snapshots de faturas após alterar configuração e aceita disponível negativo', async () => {
    const { client } = await registerClient();
    const f = await invoiceFixture(client);
    await client.request('PATCH', `/api/cards/${f.card.id}`, {
      closingDay: 10,
      dueDay: 15,
      creditLimitCents: 100,
    });
    expect(
      (await client.data<Card>('GET', `/api/cards/${f.card.id}`))
        .availableCents,
    ).toBe(-1400);
    expect(
      await client.data<Invoice>('GET', `/api/invoices/${f.invoiceId}`),
    ).toMatchObject({
      closesOn: '2026-03-20',
      dueOn: '2026-03-28',
      status: 'open',
      payment: null,
    });
    await error(
      client,
      'DELETE',
      `/api/cards/${f.card.id}`,
      undefined,
      409,
      'CONFLICT',
    );
  });

  it('quita integralmente, libera limite e não duplica despesa no dashboard/orçamento', async () => {
    const { client } = await registerClient();
    const f = await invoiceFixture(client);
    const b = await client.data<Budget>(
      'POST',
      '/api/budgets',
      { categoryId: f.category.id, month: '2026-03', limitCents: 5000 },
      201,
    );
    const before = await client.data<Dashboard>(
      'GET',
      '/api/dashboard?month=2026-03',
    );
    const paid = await client.data<Invoice>(
      'POST',
      `/api/invoices/${f.invoiceId}/pay`,
      { accountId: f.account.id },
    );
    expect(paid).toMatchObject({
      status: 'paid',
      totalCents: 1500,
      paidCents: 1500,
      outstandingCents: 0,
      paidOn: '2026-03-31',
      payment: { accountId: f.account.id, amountCents: 1500 },
    });
    expect(paid.installments).toHaveLength(1);
    expect(
      (await client.data<Card>('GET', `/api/cards/${f.card.id}`))
        .availableCents,
    ).toBe(20000);
    expect(
      (await client.data<Account>('GET', `/api/accounts/${f.account.id}`))
        .balanceCents,
    ).toBe(8500);
    expect(
      (await client.data<Dashboard>('GET', '/api/dashboard?month=2026-03'))
        .totals,
    ).toEqual({ ...before.totals, balanceCents: 8500 });
    expect(
      (await client.data<Budget>('GET', `/api/budgets/${b.id}`)).spentCents,
    ).toBe(1500);
    expect((await client.list('/api/transactions')).data).toEqual([]);
    await error(
      client,
      'POST',
      `/api/invoices/${f.invoiceId}/pay`,
      { accountId: f.account.id },
      409,
      'CONFLICT',
    );
    await error(
      client,
      'POST',
      `/api/cards/${f.card.id}/purchases`,
      purchaseInput(f.category, { installmentCount: 1 }),
      409,
      'CONFLICT',
    );
  });

  it('serializa duas quitações concorrentes com um sucesso e um conflito', async () => {
    const { client } = await registerClient();
    const f = await invoiceFixture(client);
    const results = await Promise.all([
      client.request(
        'POST',
        `/api/invoices/${f.invoiceId}/pay`,
        { accountId: f.account.id },
        [200, 409],
      ),
      client.request(
        'POST',
        `/api/invoices/${f.invoiceId}/pay`,
        { accountId: f.account.id },
        [200, 409],
      ),
    ]);
    expect(results.map((result) => result.response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      results.find((result) => result.response.status === 409)?.body.error
        ?.code,
    ).toBe('CONFLICT');
    expect(
      (await client.data<Account>('GET', `/api/accounts/${f.account.id}`))
        .balanceCents,
    ).toBe(8500);
    const persisted = await database().query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM invoice_payments WHERE invoice_id = $1',
      [f.invoiceId],
    );
    expect(persisted.rows[0]?.count).toBe(1);
  });

  it('recusa pagamento anterior ao fechamento, parcial e valores de parcelas inválidos', async () => {
    const { client } = await registerClient();
    const f = await invoiceFixture(client);
    await error(
      client,
      'POST',
      `/api/invoices/${f.invoiceId}/pay`,
      { accountId: f.account.id, paidOn: '2026-03-19' },
      422,
      'BUSINESS_RULE',
    );
    await error(
      client,
      'POST',
      `/api/invoices/${f.invoiceId}/pay`,
      { accountId: f.account.id, amountCents: 100 },
      400,
      'VALIDATION_ERROR',
    );
    for (const fields of [
      { installmentCount: 0 },
      { installmentCount: 361 },
      { installmentCount: 3, totalCents: 2 },
      { totalCents: 0 },
    ])
      await error(
        client,
        'POST',
        `/api/cards/${f.card.id}/purchases`,
        purchaseInput(f.category, fields),
        400,
        'VALIDATION_ERROR',
      );
    const income = await category(client, 'income');
    await error(
      client,
      'POST',
      `/api/cards/${f.card.id}/purchases`,
      purchaseInput(income),
      422,
      'BUSINESS_RULE',
    );
    expect(
      (await client.data<Invoice>('GET', `/api/invoices/${f.invoiceId}`))
        .status,
    ).toBe('open');
  });

  it('oculta cartão, compras e faturas estrangeiras e referências em pagamento', async () => {
    const owner = await registerClient();
    const stranger = await registerClient();
    const foreign = await invoiceFixture(owner.client);
    const local = await invoiceFixture(stranger.client);
    await hiddenCrud(stranger.client, `/api/cards/${foreign.card.id}`, {
      dueDay: 10,
    });
    for (const suffix of ['purchases', 'invoices'])
      await error(
        stranger.client,
        'GET',
        `/api/cards/${foreign.card.id}/${suffix}`,
        undefined,
        404,
        'NOT_FOUND',
      );
    await error(
      stranger.client,
      'POST',
      `/api/cards/${foreign.card.id}/purchases`,
      purchaseInput(local.category),
      404,
      'NOT_FOUND',
    );
    await error(
      stranger.client,
      'POST',
      `/api/cards/${local.card.id}/purchases`,
      purchaseInput(foreign.category),
      404,
      'NOT_FOUND',
    );
    await error(
      stranger.client,
      'GET',
      `/api/cards/${local.card.id}/purchases?categoryId=${foreign.category.id}`,
      undefined,
      404,
      'NOT_FOUND',
    );
    await error(
      stranger.client,
      'GET',
      `/api/invoices/${foreign.invoiceId}`,
      undefined,
      404,
      'NOT_FOUND',
    );
    await error(
      stranger.client,
      'POST',
      `/api/invoices/${foreign.invoiceId}/pay`,
      { accountId: local.account.id },
      404,
      'NOT_FOUND',
    );
    await error(
      stranger.client,
      'POST',
      `/api/invoices/${local.invoiceId}/pay`,
      { accountId: foreign.account.id },
      404,
      'NOT_FOUND',
    );
    expect(
      (
        await owner.client.data<Invoice>(
          'GET',
          `/api/invoices/${foreign.invoiceId}`,
        )
      ).status,
    ).toBe('open');
  });
});
