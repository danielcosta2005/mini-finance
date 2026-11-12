import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditColumns, positiveMoney } from './common.js';
import { users } from './identity.js';

export const goals = pgTable(
  'goals',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    description: text().notNull(),
    targetCents: bigint('target_cents', { mode: 'number' }).notNull(),
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...auditColumns(),
  },
  (t) => [
    unique('goals_id_user_unique').on(t.id, t.userId),
    index('goals_user_due_idx').on(t.userId, t.dueOn),
    check('goals_positive_target', positiveMoney(t.targetCents)),
    check(
      'goals_description_not_blank',
      sql`length(btrim(${t.description})) > 0`,
    ),
  ],
);

export const goalContributions = pgTable(
  'goal_contributions',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    goalId: uuid('goal_id').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    contributedOn: date('contributed_on', { mode: 'string' }).notNull(),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      name: 'goal_contributions_goal_owner_fk',
      columns: [t.goalId, t.userId],
      foreignColumns: [goals.id, goals.userId],
    }).onDelete('restrict'),
    index('goal_contributions_user_date_idx').on(t.userId, t.contributedOn),
    index('goal_contributions_goal_date_idx').on(t.goalId, t.contributedOn),
    check('goal_contributions_positive_amount', positiveMoney(t.amountCents)),
  ],
);
