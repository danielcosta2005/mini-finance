import { expect } from 'vitest';
import type { ApiClient } from '../support/client.js';

// Every case owns its user and fixtures. All application behavior crosses HTTP;
// SQL is limited to inspecting persistence and setting session lifecycle fixtures.
export type Item = { id: string };
export type Account = Item & {
  name: string;
  balanceCents: number;
  openingBalanceCents: number;
};
export type Category = Item & { name: string; type: 'income' | 'expense' };
export type Transaction = Item & {
  amountCents: number;
  occurredOn: string;
  recurrenceId: string | null;
  recurrenceOn: string | null;
};
export type Card = Item & {
  availableCents: number;
  closingDay: number;
  dueDay: number;
};
export type Installment = Item & {
  invoiceId: string;
  installmentNumber: number;
  amountCents: number;
};
export type Purchase = Item & {
  totalCents: number;
  installments: Installment[];
};
export type Invoice = Item & {
  period: string;
  closesOn: string;
  dueOn: string;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  status: string;
  paidOn: string | null;
  installments: Installment[];
  payment: { amountCents: number; accountId: string } | null;
};
export type Budget = Item & {
  month: string;
  spentCents: number;
  remainingCents: number;
  percentageUsed: string;
  exceeded: boolean;
  limitCents: number;
};
export type Goal = Item & {
  contributedCents: number;
  remainingCents: number;
  progressPercentage: string;
  achieved: boolean;
  overdue: boolean;
  targetCents: number;
};
export type Contribution = Item & {
  amountCents: number;
  contributedOn: string;
};
export type Recurrence = Item & {
  nextExecutionOn: string;
  status: string;
  amountCents: number;
};
export type ProcessResult = {
  processedRules: number;
  processedOccurrences: number;
  createdTransactions: number;
  more: boolean;
};
export type Dashboard = {
  month: string;
  totals: {
    balanceCents: number;
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  };
  categories: { categoryId: string; amountCents: number; percentage: string }[];
  evolution: {
    month: string;
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  }[];
  budgets: {
    spentCents: number;
    progressPercentage: string;
    overBudgetCount: number;
    items: Item[];
  };
};

export const account = (
  client: ApiClient,
  fields: Record<string, unknown> = {},
) =>
  client.data<Account>(
    'POST',
    '/api/accounts',
    {
      name: 'Conta exemplo',
      type: 'checking',
      openingBalanceCents: 10000,
      ...fields,
    },
    201,
  );
export const category = (
  client: ApiClient,
  type: 'income' | 'expense' = 'expense',
  name = 'Categoria exemplo',
) => client.data<Category>('POST', '/api/categories', { name, type }, 201);
export const card = (client: ApiClient, fields: Record<string, unknown> = {}) =>
  client.data<Card>(
    'POST',
    '/api/cards',
    {
      name: 'Cartão exemplo',
      creditLimitCents: 20000,
      closingDay: 20,
      dueDay: 28,
      ...fields,
    },
    201,
  );
export const goal = (client: ApiClient, fields: Record<string, unknown> = {}) =>
  client.data<Goal>(
    'POST',
    '/api/goals',
    {
      description: 'Reserva exemplo',
      targetCents: 10000,
      dueOn: '2026-06-30',
      ...fields,
    },
    201,
  );
export async function ledger(client: ApiClient) {
  return { account: await account(client), category: await category(client) };
}
export function transactionInput(
  a: Item,
  c: Item,
  fields: Record<string, unknown> = {},
) {
  return {
    accountId: a.id,
    categoryId: c.id,
    type: 'expense',
    amountCents: 1200,
    description: 'Despesa exemplo',
    occurredOn: '2026-03-15',
    ...fields,
  };
}
export async function transaction(
  client: ApiClient,
  a: Item,
  c: Item,
  fields: Record<string, unknown> = {},
) {
  return client.data<Transaction>(
    'POST',
    '/api/transactions',
    transactionInput(a, c, fields),
    201,
  );
}
export function purchaseInput(c: Item, fields: Record<string, unknown> = {}) {
  return {
    categoryId: c.id,
    totalCents: 10001,
    installmentCount: 3,
    purchasedOn: '2026-03-20',
    description: 'Compra exemplo',
    ...fields,
  };
}
export function recurrenceInput(
  a: Item,
  c: Item,
  fields: Record<string, unknown> = {},
) {
  return {
    ...transactionInput(a, c),
    occurredOn: undefined,
    startsOn: '2026-01-31',
    frequency: 'monthly',
    intervalCount: 1,
    status: 'active',
    ...fields,
  };
}
export async function recurrence(
  client: ApiClient,
  a: Item,
  c: Item,
  fields: Record<string, unknown> = {},
) {
  return client.data<Recurrence>(
    'POST',
    '/api/recurrences',
    recurrenceInput(a, c, fields),
    201,
  );
}
export async function error(
  client: ApiClient,
  method: string,
  path: string,
  body: unknown,
  status: number,
  code: string,
) {
  const result = await client.request(method, path, body, status);
  expect(result.body.error?.code).toBe(code);
  expect(result.response.headers.get('x-request-id')).toMatch(
    /^[0-9a-f-]{36}$/i,
  );
}
export async function hiddenCrud(
  client: ApiClient,
  path: string,
  patch: unknown,
) {
  await error(client, 'GET', path, undefined, 404, 'NOT_FOUND');
  await error(client, 'PATCH', path, patch, 404, 'NOT_FOUND');
  await error(client, 'DELETE', path, undefined, 404, 'NOT_FOUND');
}
export async function invoiceFixture(client: ApiClient) {
  const a = await account(client);
  const c = await category(client);
  const cc = await card(client);
  const purchase = await client.data<Purchase>(
    'POST',
    `/api/cards/${cc.id}/purchases`,
    purchaseInput(c, { totalCents: 1500, installmentCount: 1 }),
    201,
  );
  const first = purchase.installments[0];
  if (!first) throw new Error('A compra deve gerar uma parcela');
  return { account: a, category: c, card: cc, invoiceId: first.invoiceId };
}
