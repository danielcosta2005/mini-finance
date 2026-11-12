import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts, categories, transactionType } from './catalog.js';
import { auditColumns, positiveMoney } from './common.js';
import { users } from './identity.js';
import { recurrences } from './recurrences.js';

export const transactions = pgTable(
  'transactions',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id').notNull(),
    categoryId: uuid('category_id').notNull(),
    type: transactionType().notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    description: text().notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    recurrenceId: uuid('recurrence_id'),
    recurrenceOn: date('recurrence_on', { mode: 'string' }),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      name: 'transactions_account_owner_fk',
      columns: [t.accountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'transactions_category_owner_type_fk',
      columns: [t.categoryId, t.userId, t.type],
      foreignColumns: [categories.id, categories.userId, categories.type],
    }).onDelete('restrict'),
    foreignKey({
      name: 'transactions_recurrence_owner_fk',
      columns: [t.recurrenceId, t.userId],
      foreignColumns: [recurrences.id, recurrences.userId],
    }).onDelete('restrict'),
    unique('transactions_recurrence_occurrence_unique').on(
      t.recurrenceId,
      t.recurrenceOn,
    ),
    index('transactions_user_date_idx').on(t.userId, t.occurredOn),
    index('transactions_user_account_date_idx').on(
      t.userId,
      t.accountId,
      t.occurredOn,
    ),
    index('transactions_user_category_date_idx').on(
      t.userId,
      t.categoryId,
      t.occurredOn,
    ),
    index('transactions_account_idx').on(t.accountId),
    index('transactions_category_idx').on(t.categoryId),
    check('transactions_positive_amount', positiveMoney(t.amountCents)),
    check(
      'transactions_description_not_blank',
      sql`length(btrim(${t.description})) > 0`,
    ),
    check(
      'transactions_recurrence_pair',
      sql`(${t.recurrenceId} is null) = (${t.recurrenceOn} is null)`,
    ),
  ],
);

export const transfers = pgTable(
  'transfers',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sourceAccountId: uuid('source_account_id').notNull(),
    destinationAccountId: uuid('destination_account_id').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    description: text(),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      name: 'transfers_source_owner_fk',
      columns: [t.sourceAccountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'transfers_destination_owner_fk',
      columns: [t.destinationAccountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }).onDelete('restrict'),
    index('transfers_user_date_idx').on(t.userId, t.occurredOn),
    index('transfers_source_date_idx').on(t.sourceAccountId, t.occurredOn),
    index('transfers_destination_date_idx').on(
      t.destinationAccountId,
      t.occurredOn,
    ),
    check('transfers_positive_amount', positiveMoney(t.amountCents)),
    check(
      'transfers_distinct_accounts',
      sql`${t.sourceAccountId} <> ${t.destinationAccountId}`,
    ),
  ],
);

export const budgets = pgTable(
  'budgets',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id').notNull(),
    categoryType: transactionType('category_type').default('expense').notNull(),
    period: date({ mode: 'string' }).notNull(),
    limitCents: bigint('limit_cents', { mode: 'number' }).notNull(),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      name: 'budgets_category_owner_type_fk',
      columns: [t.categoryId, t.userId, t.categoryType],
      foreignColumns: [categories.id, categories.userId, categories.type],
    }).onDelete('restrict'),
    unique('budgets_user_category_period_unique').on(
      t.userId,
      t.categoryId,
      t.period,
    ),
    index('budgets_user_period_idx').on(t.userId, t.period),
    index('budgets_category_idx').on(t.categoryId),
    check('budgets_expense_only', sql`${t.categoryType} = 'expense'`),
    check(
      'budgets_month_start',
      sql`isfinite(${t.period}) and extract(day from ${t.period}) = 1`,
    ),
    check('budgets_positive_limit', positiveMoney(t.limitCents)),
  ],
);
