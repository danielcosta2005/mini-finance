import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts, categories, transactionType } from './catalog.js';
import { auditColumns, maxSafeCents, positiveMoney } from './common.js';
import { users } from './identity.js';

export const creditCards = pgTable(
  'credit_cards',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    creditLimitCents: bigint('credit_limit_cents', {
      mode: 'number',
    }).notNull(),
    closingDay: integer('closing_day').notNull(),
    dueDay: integer('due_day').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...auditColumns(),
  },
  (t) => [
    unique('credit_cards_id_user_unique').on(t.id, t.userId),
    index('credit_cards_user_idx').on(t.userId),
    check('credit_cards_name_not_blank', sql`length(btrim(${t.name})) > 0`),
    check(
      'credit_cards_safe_limit',
      sql`${t.creditLimitCents} between 0 and ${sql.raw(String(maxSafeCents))}`,
    ),
    check(
      'credit_cards_valid_days',
      sql`${t.closingDay} between 1 and 31 and ${t.dueDay} between 1 and 31`,
    ),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    creditCardId: uuid('credit_card_id').notNull(),
    period: date({ mode: 'string' }).notNull(),
    closesOn: date('closes_on', { mode: 'string' }).notNull(),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    // Snapshot the schedule so later card setting changes cannot rewrite history.
    closingDay: integer('closing_day').notNull(),
    dueDay: integer('due_day').notNull(),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      name: 'invoices_card_owner_fk',
      columns: [t.creditCardId, t.userId],
      foreignColumns: [creditCards.id, creditCards.userId],
    }).onDelete('restrict'),
    unique('invoices_card_period_unique').on(t.creditCardId, t.period),
    unique('invoices_id_card_user_unique').on(t.id, t.creditCardId, t.userId),
    unique('invoices_id_user_unique').on(t.id, t.userId),
    index('invoices_user_period_idx').on(t.userId, t.period),
    index('invoices_user_due_idx').on(t.userId, t.dueOn),
    check(
      'invoices_valid_dates',
      sql`isfinite(${t.period}) and isfinite(${t.closesOn}) and isfinite(${t.dueOn}) and ${t.dueOn} >= ${t.closesOn} and ${t.period} = date_trunc('month', ${t.dueOn}::timestamp)::date`,
    ),
    check(
      'invoices_valid_days',
      sql`${t.closingDay} between 1 and 31 and ${t.dueDay} between 1 and 31`,
    ),
  ],
);

export const cardPurchases = pgTable(
  'card_purchases',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    creditCardId: uuid('credit_card_id').notNull(),
    categoryId: uuid('category_id').notNull(),
    categoryType: transactionType('category_type').default('expense').notNull(),
    totalCents: bigint('total_cents', { mode: 'number' }).notNull(),
    purchasedOn: date('purchased_on', { mode: 'string' }).notNull(),
    description: text().notNull(),
    installmentCount: integer('installment_count').notNull(),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      name: 'card_purchases_card_owner_fk',
      columns: [t.creditCardId, t.userId],
      foreignColumns: [creditCards.id, creditCards.userId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'card_purchases_category_owner_type_fk',
      columns: [t.categoryId, t.userId, t.categoryType],
      foreignColumns: [categories.id, categories.userId, categories.type],
    }).onDelete('restrict'),
    unique('card_purchases_id_card_user_unique').on(
      t.id,
      t.creditCardId,
      t.userId,
    ),
    index('card_purchases_user_date_idx').on(t.userId, t.purchasedOn),
    index('card_purchases_user_category_date_idx').on(
      t.userId,
      t.categoryId,
      t.purchasedOn,
    ),
    index('card_purchases_card_date_idx').on(t.creditCardId, t.purchasedOn),
    index('card_purchases_category_idx').on(t.categoryId),
    check('card_purchases_positive_total', positiveMoney(t.totalCents)),
    check(
      'card_purchases_valid_count',
      sql`${t.installmentCount} > 0 and ${t.installmentCount} <= ${t.totalCents}`,
    ),
    check('card_purchases_expense_only', sql`${t.categoryType} = 'expense'`),
    check(
      'card_purchases_description_not_blank',
      sql`length(btrim(${t.description})) > 0`,
    ),
  ],
);

export const cardInstallments = pgTable(
  'card_installments',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    purchaseId: uuid('purchase_id').notNull(),
    creditCardId: uuid('credit_card_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    installmentNumber: integer('installment_number').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      name: 'card_installments_purchase_owner_card_fk',
      columns: [t.purchaseId, t.creditCardId, t.userId],
      foreignColumns: [
        cardPurchases.id,
        cardPurchases.creditCardId,
        cardPurchases.userId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'card_installments_invoice_owner_card_fk',
      columns: [t.invoiceId, t.creditCardId, t.userId],
      foreignColumns: [invoices.id, invoices.creditCardId, invoices.userId],
    }).onDelete('restrict'),
    unique('card_installments_purchase_number_unique').on(
      t.purchaseId,
      t.installmentNumber,
    ),
    index('card_installments_invoice_idx').on(t.invoiceId),
    index('card_installments_user_idx').on(t.userId),
    index('card_installments_card_idx').on(t.creditCardId),
    check('card_installments_positive_amount', positiveMoney(t.amountCents)),
    check('card_installments_positive_number', sql`${t.installmentNumber} > 0`),
  ],
);

export const invoicePayments = pgTable(
  'invoice_payments',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    invoiceId: uuid('invoice_id').notNull(),
    accountId: uuid('account_id').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    paidOn: date('paid_on', { mode: 'string' }).notNull(),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      name: 'invoice_payments_invoice_owner_fk',
      columns: [t.invoiceId, t.userId],
      foreignColumns: [invoices.id, invoices.userId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'invoice_payments_account_owner_fk',
      columns: [t.accountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }).onDelete('restrict'),
    unique('invoice_payments_invoice_unique').on(t.invoiceId),
    index('invoice_payments_user_date_idx').on(t.userId, t.paidOn),
    index('invoice_payments_account_date_idx').on(t.accountId, t.paidOn),
    check('invoice_payments_positive_amount', positiveMoney(t.amountCents)),
  ],
);
