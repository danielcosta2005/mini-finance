import { bigint, date, numeric, pgView, uuid } from 'drizzle-orm/pg-core';

// Created by the custom SQL migration, not by drizzle-kit push/generate.
// SUM(bigint) remains numeric/string: convert via BigInt + toJsonCents at the JSON boundary.
export const accountBalances = pgView('account_balances', {
  accountId: uuid('account_id').notNull(),
  userId: uuid('user_id').notNull(),
  balanceCents: numeric('balance_cents').notNull(),
}).existing();

export const invoiceTotals = pgView('invoice_totals', {
  invoiceId: uuid('invoice_id').notNull(),
  userId: uuid('user_id').notNull(),
  creditCardId: uuid('credit_card_id').notNull(),
  period: date({ mode: 'string' }).notNull(),
  totalCents: numeric('total_cents').notNull(),
  paidCents: numeric('paid_cents').notNull(),
  outstandingCents: numeric('outstanding_cents').notNull(),
  paidOn: date('paid_on', { mode: 'string' }),
}).existing();

export const cardAvailableLimits = pgView('card_available_limits', {
  creditCardId: uuid('credit_card_id').notNull(),
  userId: uuid('user_id').notNull(),
  availableCents: numeric('available_cents').notNull(),
}).existing();

export const budgetSpending = pgView('budget_spending', {
  budgetId: uuid('budget_id').notNull(),
  userId: uuid('user_id').notNull(),
  categoryId: uuid('category_id').notNull(),
  period: date({ mode: 'string' }).notNull(),
  limitCents: bigint('limit_cents', { mode: 'number' }).notNull(),
  spentCents: numeric('spent_cents').notNull(),
}).existing();
