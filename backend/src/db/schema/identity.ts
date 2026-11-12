import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns } from './common.js';

export const users = pgTable(
  'users',
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    email: text().notNull(),
    passwordHash: text('password_hash').notNull(),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex('users_email_unique').on(sql`lower(btrim(${t.email}))`),
    check('users_name_not_blank', sql`length(btrim(${t.name})) > 0`),
    check(
      'users_email_format',
      sql`${t.email} ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'`,
    ),
    check(
      'users_password_hash_not_blank',
      sql`length(btrim(${t.passwordHash})) > 0`,
    ),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...auditColumns(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_unique').on(t.tokenHash),
    index('sessions_user_expiry_idx').on(t.userId, t.expiresAt),
    index('sessions_expiry_idx').on(t.expiresAt),
    check('sessions_token_hash_sha256', sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check('sessions_valid_expiry', sql`${t.expiresAt} > ${t.createdAt}`),
    check(
      'sessions_valid_revocation',
      sql`${t.revokedAt} is null or ${t.revokedAt} >= ${t.createdAt}`,
    ),
  ],
);
