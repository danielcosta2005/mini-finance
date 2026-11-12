import { sql } from 'drizzle-orm';
import { type AnyPgColumn, timestamp } from 'drizzle-orm/pg-core';

export const maxSafeCents = 9_007_199_254_740_991n;
export function positiveMoney(column: AnyPgColumn) {
  return sql`${column} between 1 and ${sql.raw(String(maxSafeCents))}`;
}
export function signedMoney(column: AnyPgColumn) {
  return sql`${column} between ${sql.raw(String(-maxSafeCents))} and ${sql.raw(String(maxSafeCents))}`;
}
export function auditColumns() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  };
}
