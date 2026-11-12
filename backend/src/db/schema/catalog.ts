import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns, signedMoney } from './common.js';
import { users } from './identity.js';

export const accountType = pgEnum('account_type', [
  'checking',
  'savings',
  'cash',
  'investment',
  'other',
]);
export const transactionType = pgEnum('transaction_type', [
  'income',
  'expense',
]);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    type: accountType().notNull(),
    openingBalanceCents: bigint('opening_balance_cents', { mode: 'number' })
      .default(0)
      .notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...auditColumns(),
  },
  (t) => [
    unique('accounts_id_user_unique').on(t.id, t.userId),
    index('accounts_user_idx').on(t.userId),
    check('accounts_name_not_blank', sql`length(btrim(${t.name})) > 0`),
    check('accounts_opening_balance_safe', signedMoney(t.openingBalanceCents)),
  ],
);

export const categories = pgTable(
  'categories',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    type: transactionType().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...auditColumns(),
  },
  (t) => [
    unique('categories_id_user_type_unique').on(t.id, t.userId, t.type),
    index('categories_user_type_idx').on(t.userId, t.type),
    check('categories_name_not_blank', sql`length(btrim(${t.name})) > 0`),
  ],
);
