import { describe, expect, it, vi } from 'vitest';
import type { CardsRepository } from '../../src/modules/cards/repositories.js';
import {
  cardsQuerySchema,
  createCardSchema,
  createPurchaseSchema,
  invoicesQuerySchema,
  payInvoiceSchema,
  purchasesQuerySchema,
  updateCardSchema,
} from '../../src/modules/cards/schemas.js';
import { createCardsService } from '../../src/modules/cards/services.js';

const userId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const categoryId = '00000000-0000-4000-8000-000000000003';
const accountId = '00000000-0000-4000-8000-000000000004';
const now = new Date('2026-02-28T15:00:00Z');
type Card = NonNullable<Awaited<ReturnType<CardsRepository['getCard']>>>;
type Invoice = NonNullable<Awaited<ReturnType<CardsRepository['getInvoice']>>>;
const card: Card = {
  card: {
    id,
    userId,
    name: 'Cartão fictício',
    creditLimitCents: 5000,
    closingDay: 10,
    dueDay: 20,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  availableCents: '4000',
};
const invoice: Invoice = {
  invoice: {
    id: 'invoice-a',
    userId,
    creditCardId: id,
    period: '2026-02-01',
    closesOn: '2026-02-10',
    dueOn: '2026-02-20',
    closingDay: 10,
    dueDay: 20,
    createdAt: now,
    updatedAt: now,
  },
  totalCents: '1000',
  paidCents: '0',
  outstandingCents: '1000',
  paidOn: null,
};
const purchaseInput = {
  categoryId,
  totalCents: 1000,
  purchasedOn: '2026-02-01',
  description: 'Compra fictícia',
  installmentCount: 3,
};
function setup() {
  const purchase = {
    id: 'purchase-a',
    userId,
    creditCardId: id,
    categoryType: 'expense' as const,
    ...purchaseInput,
    createdAt: now,
    updatedAt: now,
  };
  const repo = {
    getCard: vi.fn<CardsRepository['getCard']>().mockResolvedValue(card),
    lockCard: vi.fn<CardsRepository['lockCard']>().mockResolvedValue(card.card),
    listCards: vi
      .fn<CardsRepository['listCards']>()
      .mockResolvedValue({ rows: [card], total: 1 }),
    createCard: vi
      .fn<CardsRepository['createCard']>()
      .mockResolvedValue(card.card),
    updateCard: vi
      .fn<CardsRepository['updateCard']>()
      .mockResolvedValue(card.card),
    cardHasHistory: vi
      .fn<CardsRepository['cardHasHistory']>()
      .mockResolvedValue(false),
    deleteCard: vi
      .fn<CardsRepository['deleteCard']>()
      .mockResolvedValue(undefined),
    lockCategory: vi.fn<CardsRepository['lockCategory']>().mockResolvedValue({
      id: categoryId,
      userId,
      name: 'Despesa fictícia',
      type: 'expense',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    }),
    lockAccount: vi.fn<CardsRepository['lockAccount']>().mockResolvedValue({
      id: accountId,
      userId,
      name: 'Conta fictícia',
      type: 'checking',
      openingBalanceCents: 0,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    }),
    createPurchase: vi
      .fn<CardsRepository['createPurchase']>()
      .mockResolvedValue(purchase),
    listPurchases: vi
      .fn<CardsRepository['listPurchases']>()
      .mockResolvedValue({ rows: [purchase], total: 1 }),
    ensureInvoice: vi
      .fn<CardsRepository['ensureInvoice']>()
      .mockImplementation(async (input) => ({
        ...invoice.invoice,
        ...input,
        id: `invoice-${input.period}`,
        createdAt: now,
        updatedAt: now,
      })),
    insertInstallments: vi
      .fn<CardsRepository['insertInstallments']>()
      .mockImplementation(async (parts) =>
        parts.map((part, index) => ({
          ...part,
          id: `part-${index}`,
          createdAt: now,
          updatedAt: now,
        })),
      ),
    getInvoice: vi
      .fn<CardsRepository['getInvoice']>()
      .mockResolvedValue(invoice),
    lockInvoice: vi
      .fn<CardsRepository['lockInvoice']>()
      .mockResolvedValue(invoice.invoice),
    listInvoices: vi
      .fn<CardsRepository['listInvoices']>()
      .mockResolvedValue({ rows: [invoice], total: 1 }),
    invoiceInstallments: vi
      .fn<CardsRepository['invoiceInstallments']>()
      .mockResolvedValue([]),
    getPayment: vi
      .fn<CardsRepository['getPayment']>()
      .mockResolvedValue(undefined),
    createPayment: vi.fn<CardsRepository['createPayment']>().mockResolvedValue({
      id: 'payment-a',
      userId,
      invoiceId: invoice.invoice.id,
      accountId,
      amountCents: 1000,
      paidOn: '2026-02-28',
      createdAt: now,
      updatedAt: now,
    }),
    transaction<T>(
      work: (scope: Omit<CardsRepository, 'transaction'>) => Promise<T>,
    ): Promise<T> {
      return work(repo);
    },
  };
  vi.spyOn(repo, 'transaction');
  return {
    repo,
    service: createCardsService(repo, { now: () => now }, 'America/Sao_Paulo'),
  };
}

describe('card lifecycle and DTOs', () => {
  it('serializes the available limit without recalculating it', async () => {
    const { repo, service } = setup();
    repo.getCard.mockResolvedValue({ ...card, availableCents: '-334' });
    expect(await service.getCard(userId, id)).toMatchObject({
      creditLimitCents: 5000,
      availableCents: -334,
    });
    expect(repo.getCard).toHaveBeenCalledWith(userId, id);
  });
  it('paginates cards with available cents', async () => {
    expect(
      await setup().service.listCards(userId, { page: 1, pageSize: 20 }),
    ).toMatchObject({
      data: [{ availableCents: 4000 }],
      pagination: { total: 1 },
    });
  });
  it('creates then reads the computed limit', async () => {
    const { repo, service } = setup();
    const input = createCardSchema.parse({
      name: 'Cartão fictício',
      creditLimitCents: 5000,
      closingDay: 10,
      dueDay: 20,
    });
    await service.createCard(userId, input);
    expect(repo.createCard).toHaveBeenCalledWith(userId, input);
  });
  it('updates owned cards while holding the card lock', async () => {
    const { repo, service } = setup();
    await service.updateCard(userId, id, { closingDay: 31 });
    expect(repo.transaction).toHaveBeenCalledOnce();
    expect(repo.updateCard).toHaveBeenCalledWith(userId, id, {
      closingDay: 31,
    });
    expect(repo.lockCard.mock.invocationCallOrder[0]).toBeLessThan(
      repo.updateCard.mock.invocationCallOrder[0] ?? 0,
    );
  });
  it('deletes a card without financial history', async () => {
    const { repo, service } = setup();
    expect(await service.deleteCard(userId, id)).toEqual({ id, deleted: true });
    expect(repo.deleteCard).toHaveBeenCalledWith(userId, id);
  });
  it('protects cards with financial history', async () => {
    const { repo, service } = setup();
    repo.cardHasHistory.mockResolvedValue(true);
    await expect(service.deleteCard(userId, id)).rejects.toMatchObject({
      status: 409,
    });
    expect(repo.deleteCard).not.toHaveBeenCalled();
  });
  it.each(['get', 'purchases', 'invoices'] as const)(
    'conceals foreign card for %s',
    async (action) => {
      const { repo, service } = setup();
      repo.getCard.mockResolvedValue(undefined);
      const query = { page: 1, pageSize: 20 };
      await expect(
        action === 'get'
          ? service.getCard(userId, id)
          : action === 'purchases'
            ? service.listPurchases(userId, id, query)
            : service.listInvoices(userId, id, query),
      ).rejects.toMatchObject({ status: 404 });
    },
  );
  it.each(['update', 'delete', 'purchase'] as const)(
    'requires owned lock for %s',
    async (action) => {
      const { repo, service } = setup();
      repo.lockCard.mockResolvedValue(undefined);
      await expect(
        action === 'update'
          ? service.updateCard(userId, id, { name: 'Novo nome' })
          : action === 'delete'
            ? service.deleteCard(userId, id)
            : service.createPurchase(userId, id, purchaseInput),
      ).rejects.toMatchObject({ status: 404 });
    },
  );
  it('validates category ownership before listing filtered purchases', async () => {
    const { repo, service } = setup();
    repo.lockCategory.mockResolvedValue(undefined);
    await expect(
      service.listPurchases(userId, id, { page: 1, pageSize: 20, categoryId }),
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.listPurchases).not.toHaveBeenCalled();
  });
  it('passes purchase filters and page metadata through', async () => {
    const { repo, service } = setup();
    const query = { page: 2, pageSize: 1, categoryId };
    expect(await service.listPurchases(userId, id, query)).toMatchObject({
      pagination: { page: 2, total: 1 },
    });
    expect(repo.listPurchases).toHaveBeenCalledWith(userId, id, query);
  });
});

describe('purchase allocation and immutable invoice calendars', () => {
  it('allocates 1000 cents as 334,333,333 over three invoice months', async () => {
    const { repo, service } = setup();
    const result = await service.createPurchase(userId, id, purchaseInput);
    expect(result.installments.map((item) => item.amountCents)).toEqual([
      334, 333, 333,
    ]);
    expect(
      repo.ensureInvoice.mock.calls.map(([input]) => input.period),
    ).toEqual(['2026-02-01', '2026-03-01', '2026-04-01']);
  });
  it.each([
    ['2026-02-10', 10, 20, '2026-02-10', '2026-02-20'],
    ['2026-02-11', 10, 20, '2026-03-10', '2026-03-20'],
    ['2028-02-28', 31, 31, '2028-02-29', '2028-03-31'],
    ['2026-02-28', 31, 31, '2026-02-28', '2026-03-31'],
    ['2026-12-31', 10, 20, '2027-01-10', '2027-01-20'],
  ])(
    'uses the real billing calendar for %s',
    async (purchasedOn, closingDay, dueDay, closesOn, dueOn) => {
      const { repo, service } = setup();
      repo.lockCard.mockResolvedValue({ ...card.card, closingDay, dueDay });
      await service.createPurchase(userId, id, {
        ...purchaseInput,
        purchasedOn,
        installmentCount: 1,
      });
      expect(repo.ensureInvoice.mock.calls[0]?.[0]).toMatchObject({
        closesOn,
        dueOn,
      });
    },
  );
  it('rejects unsupported final dates before any purchase write', async () => {
    const { repo, service } = setup();
    await expect(
      service.createPurchase(userId, id, {
        ...purchaseInput,
        purchasedOn: '9999-12-01',
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repo.createPurchase).not.toHaveBeenCalled();
  });
  it('rejects purchases on archived cards', async () => {
    const { repo, service } = setup();
    repo.lockCard.mockResolvedValue({ ...card.card, archivedAt: now });
    await expect(
      service.createPurchase(userId, id, purchaseInput),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('preserves validation errors from malformed purchase dates before writing', async () => {
    const { repo, service } = setup();
    await expect(
      service.createPurchase(userId, id, {
        ...purchaseInput,
        purchasedOn: 'invalid-date',
      }),
    ).rejects.toMatchObject({ name: 'ZodError' });
    expect(repo.createPurchase).not.toHaveBeenCalled();
  });
  it('conceals a category owned by another user', async () => {
    const { repo, service } = setup();
    repo.lockCategory.mockResolvedValue(undefined);
    await expect(
      service.createPurchase(userId, id, purchaseInput),
    ).rejects.toMatchObject({ status: 404 });
  });
  it.each(['income', 'archived'] as const)(
    'rejects %s purchase categories',
    async (kind) => {
      const { repo, service } = setup();
      const category = await repo.lockCategory(userId, categoryId);
      if (!category) throw new Error('fixture');
      repo.lockCategory.mockResolvedValue({
        ...category,
        type: kind === 'income' ? 'income' : 'expense',
        archivedAt: kind === 'archived' ? now : null,
      });
      await expect(
        service.createPurchase(userId, id, purchaseInput),
      ).rejects.toMatchObject({ status: 422 });
      expect(repo.createPurchase).not.toHaveBeenCalled();
    },
  );
  it('refuses additions to paid invoice history', async () => {
    const { repo, service } = setup();
    repo.getPayment.mockResolvedValue({
      id: 'payment-a',
      userId,
      invoiceId: 'invoice-a',
      accountId,
      amountCents: 1000,
      paidOn: '2026-02-28',
      createdAt: now,
      updatedAt: now,
    });
    await expect(
      service.createPurchase(userId, id, purchaseInput),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.insertInstallments).not.toHaveBeenCalled();
  });
  it.each([{ period: '2026-03-01' }, { closesOn: '2026-02-09' }])(
    'protects an existing invoice calendar %j',
    async (override) => {
      const { repo, service } = setup();
      repo.ensureInvoice.mockResolvedValue({ ...invoice.invoice, ...override });
      await expect(
        service.createPurchase(userId, id, purchaseInput),
      ).rejects.toMatchObject({ status: 409 });
      expect(repo.insertInstallments).not.toHaveBeenCalled();
    },
  );
});

describe('invoice presentation and full payment', () => {
  it('presents unpaid totals and null payment', async () => {
    expect(await setup().service.getInvoice(userId, 'invoice-a')).toMatchObject(
      {
        totalCents: 1000,
        paidCents: 0,
        outstandingCents: 1000,
        status: 'open',
        payment: null,
        installments: [],
      },
    );
  });
  it('flattens installment details and presents paid status', async () => {
    const { repo, service } = setup();
    repo.getInvoice.mockResolvedValue({
      ...invoice,
      paidOn: '2026-02-28',
      paidCents: '1000',
      outstandingCents: '0',
    });
    repo.invoiceInstallments.mockResolvedValue([
      {
        installment: {
          id: 'part-a',
          userId,
          purchaseId: 'purchase-a',
          creditCardId: id,
          invoiceId: 'invoice-a',
          installmentNumber: 1,
          amountCents: 1000,
          createdAt: now,
          updatedAt: now,
        },
        description: 'Compra fictícia',
        purchasedOn: '2026-02-01',
        installmentCount: 1,
      },
    ]);
    const payment = await repo.createPayment({
      userId,
      invoiceId: 'invoice-a',
      accountId,
      amountCents: 1000,
      paidOn: '2026-02-28',
    });
    repo.getPayment.mockResolvedValue(payment);
    expect(await service.getInvoice(userId, 'invoice-a')).toMatchObject({
      status: 'paid',
      installments: [{ description: 'Compra fictícia', amountCents: 1000 }],
      payment,
    });
  });
  it('maps paginated invoices through safe totals', async () =>
    expect(
      await setup().service.listInvoices(userId, id, { page: 1, pageSize: 20 }),
    ).toMatchObject({ data: [{ totalCents: 1000, status: 'open' }] }));
  it('pays the entire locked total and derives the date from its clock', async () => {
    const { repo, service } = setup();
    await service.payInvoice(userId, 'invoice-a', { accountId });
    expect(repo.createPayment).toHaveBeenCalledWith({
      userId,
      invoiceId: 'invoice-a',
      accountId,
      amountCents: 1000,
      paidOn: '2026-02-28',
    });
    expect(repo.lockCard.mock.invocationCallOrder[0]).toBeLessThan(
      repo.lockInvoice.mock.invocationCallOrder[0] ?? 0,
    );
  });
  it('accepts payment exactly on closing day', async () => {
    const { repo, service } = setup();
    await service.payInvoice(userId, 'invoice-a', {
      accountId,
      paidOn: '2026-02-10',
    });
    expect(repo.createPayment.mock.calls[0]?.[0].paidOn).toBe('2026-02-10');
  });
  it('rejects payment before closing', async () => {
    const { repo, service } = setup();
    await expect(
      service.payInvoice(userId, 'invoice-a', {
        accountId,
        paidOn: '2026-02-09',
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(repo.createPayment).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '9007199254740992'])(
    'rejects an invalid full invoice total %s',
    async (totalCents) => {
      const { repo, service } = setup();
      repo.getInvoice.mockResolvedValue({ ...invoice, totalCents });
      await expect(
        service.payInvoice(userId, 'invoice-a', { accountId }),
      ).rejects.toMatchObject({ status: 422 });
      expect(repo.createPayment).not.toHaveBeenCalled();
    },
  );
  it('rejects duplicate payment', async () => {
    const { repo, service } = setup();
    repo.getPayment.mockResolvedValue(
      await repo.createPayment({
        userId,
        invoiceId: 'invoice-a',
        accountId,
        amountCents: 1000,
        paidOn: '2026-02-28',
      }),
    );
    repo.createPayment.mockClear();
    await expect(
      service.payInvoice(userId, 'invoice-a', { accountId }),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.createPayment).not.toHaveBeenCalled();
  });
  it('rejects an inactive debit account', async () => {
    const { repo, service } = setup();
    const account = await repo.lockAccount(userId, accountId);
    if (!account) throw new Error('fixture');
    repo.lockAccount.mockResolvedValue({ ...account, archivedAt: now });
    await expect(
      service.payInvoice(userId, 'invoice-a', { accountId }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it.each(['invoice', 'card', 'account', 'lock', 'reread'] as const)(
    'conceals missing owned payment resource: %s',
    async (resource) => {
      const { repo, service } = setup();
      if (resource === 'invoice') repo.getInvoice.mockResolvedValue(undefined);
      if (resource === 'card') repo.lockCard.mockResolvedValue(undefined);
      if (resource === 'account') repo.lockAccount.mockResolvedValue(undefined);
      if (resource === 'lock') repo.lockInvoice.mockResolvedValue(undefined);
      if (resource === 'reread')
        repo.getInvoice
          .mockResolvedValueOnce(invoice)
          .mockResolvedValue(undefined);
      await expect(
        service.payInvoice(userId, 'invoice-a', { accountId }),
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.createPayment).not.toHaveBeenCalled();
    },
  );
  it('returns 404 for missing invoice detail', async () => {
    const { repo, service } = setup();
    repo.getInvoice.mockResolvedValue(undefined);
    await expect(service.getInvoice(userId, 'invoice-a')).rejects.toMatchObject(
      { status: 404 },
    );
  });
});

describe('card request schemas', () => {
  it('supplies defaults only for create purchase and pagination', () => {
    const { installmentCount: _count, ...input } = purchaseInput;
    expect(createPurchaseSchema.parse(input).installmentCount).toBe(1);
    expect(cardsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(updateCardSchema.parse({ closingDay: 31 })).toEqual({
      closingDay: 31,
    });
  });
  it.each([
    {},
    { creditLimitCents: -1 },
    { closingDay: 32 },
    { dueDay: 0 },
    { name: ' ' },
    { extra: true },
  ])('rejects invalid card patches %j', (value) =>
    expect(updateCardSchema.safeParse(value).success).toBe(false),
  );
  it.each([
    { installmentCount: 1001 },
    { installmentCount: 361 },
    { installmentCount: 0 },
    { totalCents: 0 },
    { purchasedOn: '2026-02-29' },
    { userId },
  ])('rejects invalid purchases %j', (override) =>
    expect(
      createPurchaseSchema.safeParse({ ...purchaseInput, ...override }).success,
    ).toBe(false),
  );
  it('rejects out-of-order filters, invalid months and partial payment injection', () => {
    expect(
      purchasesQuerySchema.safeParse({ from: '2026-03-01', to: '2026-02-01' })
        .success,
    ).toBe(false);
    expect(invoicesQuerySchema.safeParse({ month: '2026-13' }).success).toBe(
      false,
    );
    expect(
      payInvoiceSchema.safeParse({ accountId, amountCents: 1 }).success,
    ).toBe(false);
  });
});
