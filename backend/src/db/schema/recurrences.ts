import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts, categories, transactionType } from './catalog.js';
import { auditColumns, positiveMoney } from './common.js';
import { users } from './identity.js';

export const recurrenceFrequency = pgEnum('recurrence_frequency', [
  'daily',
  'weekly',
  'monthly',
  'yearly',
]);
export const recurrenceStatus = pgEnum('recurrence_status', [
  'active',
  'paused',
  'completed',
]);
export const recurrences = pgTable(
  'recurrences',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id').notNull(),
    categoryId: uuid('category_id').notNull(),
    type: transactionType().notNull(),
    description: text().notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    frequency: recurrenceFrequency().notNull(),
    intervalCount: integer('interval_count').default(1).notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    nextExecutionOn: date('next_execution_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }),
    status: recurrenceStatus().default('active').notNull(),
    ...auditColumns(),
  },
  (t) => [
    unique('recurrences_id_user_unique').on(t.id, t.userId),
    foreignKey({
      name: 'recurrences_account_owner_fk',
      columns: [t.accountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'recurrences_category_owner_type_fk',
      columns: [t.categoryId, t.userId, t.type],
      foreignColumns: [categories.id, categories.userId, categories.type],
    }).onDelete('restrict'),
    index('recurrences_user_next_idx').on(t.userId, t.nextExecutionOn),
    index('recurrences_due_idx')
      .on(t.nextExecutionOn)
      .where(sql`${t.status} = 'active'`),
    index('recurrences_account_idx').on(t.accountId),
    index('recurrences_category_idx').on(t.categoryId),
    check('recurrences_positive_amount', positiveMoney(t.amountCents)),
    check('recurrences_positive_interval', sql`${t.intervalCount} > 0`),
    check(
      'recurrences_valid_dates',
      sql`${t.nextExecutionOn} >= ${t.startsOn} and (${t.endsOn} is null or ${t.endsOn} >= ${t.startsOn})`,
    ),
    check(
      'recurrences_description_not_blank',
      sql`length(btrim(${t.description})) > 0`,
    ),
  ],
);
