import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import * as schema from '../../src/db/schema/index.js';
import { getInvoiceDates } from '../../src/shared/billing.js';
import { getInstallmentCents } from '../../src/shared/installments.js';

const url = process.env.INTEGRATION_DATABASE_URL;
if (
  !url ||
  !URL.canParse(url) ||
  new URL(url).pathname !== '/minifinance_test'
) {
  throw new Error(
    'INTEGRATION_DATABASE_URL must target the isolated minifinance_test database',
  );
}
const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
afterAll(() => pool.end());

async function isolated(work: (client: PoolClient) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await work(client);
  } finally {
    await client.query('rollback');
    client.release();
  }
}

// All data in this file is fictional and is rolled back after each case.
async function fixture(client: PoolClient) {
  const user = randomUUID();
  const otherUser = randomUUID();
  const account = randomUUID();
  const otherAccount = randomUUID();
  const category = randomUUID();
  const incomeCategory = randomUUID();
  const card = randomUUID();
  await client.query(
    `insert into users (id, name, email, password_hash) values ($1, 'Example A', $2, 'placeholder-hash'), ($3, 'Example B', $4, 'placeholder-hash')`,
    [
      user,
      `${user}@example.invalid`,
      otherUser,
      `${otherUser}@example.invalid`,
    ],
  );
  await client.query(
    `insert into accounts (id, user_id, name, type, opening_balance_cents) values ($1, $2, 'Example account', 'checking', 10000), ($3, $4, 'Other example', 'cash', 0)`,
    [account, user, otherAccount, otherUser],
  );
  await client.query(
    `insert into categories (id, user_id, name, type) values ($1, $2, 'Example expense', 'expense'), ($3, $2, 'Example income', 'income')`,
    [category, user, incomeCategory],
  );
  await client.query(
    `insert into credit_cards (id, user_id, name, credit_limit_cents, closing_day, due_day) values ($1, $2, 'Example card', 10000, 10, 20)`,
    [card, user],
  );
  return {
    user,
    otherUser,
    account,
    otherAccount,
    category,
    incomeCategory,
    card,
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function purchase(
  client: PoolClient,
  f: Fixture,
  total = 1000,
  count = 3,
) {
  const purchaseId = randomUUID();
  const invoiceIds: string[] = [];
  const partIds: string[] = [];
  await client.query(
    `insert into card_purchases (id, user_id, credit_card_id, category_id, total_cents, purchased_on, description, installment_count) values ($1, $2, $3, $4, $5, '2026-01-05', 'Example purchase', $6)`,
    [purchaseId, f.user, f.card, f.category, total, count],
  );
  for (let number = 1; number <= count; number++) {
    const dates = getInvoiceDates('2026-01-05', 10, 20, number - 1);
    const result = await client.query<{ id: string }>(
      `insert into invoices (user_id, credit_card_id, period, closes_on, due_on, closing_day, due_day) values ($1, $2, $3, $4, $5, 10, 20) on conflict (credit_card_id, period) do update set updated_at = invoices.updated_at returning id`,
      [f.user, f.card, dates.period, dates.closesOn, dates.dueOn],
    );
    const invoiceId = result.rows[0]?.id;
    if (!invoiceId) throw new Error('Invoice fixture was not created');
    invoiceIds.push(invoiceId);
    const partId = randomUUID();
    partIds.push(partId);
    await client.query(
      `insert into card_installments (id, user_id, purchase_id, credit_card_id, invoice_id, installment_number, amount_cents) values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        partId,
        f.user,
        purchaseId,
        f.card,
        invoiceId,
        number,
        getInstallmentCents(total, count, number),
      ],
    );
  }
  return { purchaseId, invoiceIds, partIds };
}

async function pay(
  client: PoolClient,
  f: Fixture,
  invoiceId: string | undefined,
  amount = 334,
) {
  await client.query(
    `insert into invoice_payments (user_id, invoice_id, account_id, amount_cents, paid_on) values ($1, $2, $3, $4, '2026-01-20')`,
    [f.user, invoiceId, f.account, amount],
  );
}

describe('financial PostgreSQL schema', () => {
  it('creates all 15 tables and uses BIGINT/date/timestamptz columns', async () => {
    const result = await pool.query(
      `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    expect(
      result.rows.map((row: { table_name: string }) => row.table_name).sort(),
    ).toEqual(
      [
        'accounts',
        'budgets',
        'card_installments',
        'card_purchases',
        'categories',
        'credit_cards',
        'goal_contributions',
        'goals',
        'invoice_payments',
        'invoices',
        'recurrences',
        'sessions',
        'transactions',
        'transfers',
        'users',
      ].sort(),
    );
    const columns = await pool.query(
      `select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'transactions'`,
    );
    expect(columns.rows).toEqual(
      expect.arrayContaining([
        { column_name: 'id', data_type: 'uuid' },
        { column_name: 'amount_cents', data_type: 'bigint' },
        { column_name: 'occurred_on', data_type: 'date' },
        { column_name: 'created_at', data_type: 'timestamp with time zone' },
      ]),
    );
  });

  it('has foreign keys, query indexes and deferred financial constraints', async () => {
    const constraints = await pool.query(
      `select conname, contype, condeferrable, condeferred from pg_constraint where connamespace = 'public'::regnamespace`,
    );
    expect(constraints.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conname: 'transactions_account_owner_fk',
          contype: 'f',
        }),
        expect.objectContaining({
          conname: 'transactions_positive_amount',
          contype: 'c',
        }),
        expect.objectContaining({
          conname: 'card_purchases_complete_installments',
          condeferrable: true,
          condeferred: true,
        }),
      ]),
    );
    const indexes = await pool.query(
      `select indexname from pg_indexes where schemaname = 'public'`,
    );
    expect(
      indexes.rows.map((row: { indexname: string }) => row.indexname),
    ).toEqual(
      expect.arrayContaining([
        'transactions_user_date_idx',
        'transactions_user_category_date_idx',
        'transactions_user_account_date_idx',
        'invoice_payments_invoice_unique',
        'budgets_user_category_period_unique',
        'invoices_card_period_unique',
        'card_installments_purchase_number_unique',
        'transactions_recurrence_occurrence_unique',
      ]),
    );
  });

  it('keeps typed fixtures isolated by owner', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      await expect(
        client.query(
          `insert into transactions (user_id, account_id, category_id, type, amount_cents, description, occurred_on) values ($1, $2, $3, 'expense', 100, 'Example', '2026-01-01')`,
          [f.user, f.otherAccount, f.category],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  it.each([0, -1, '9007199254740992'])(
    'rejects invalid movement cents %s',
    async (amount) => {
      await isolated(async (client) => {
        const f = await fixture(client);
        await expect(
          client.query(
            `insert into transactions (user_id, account_id, category_id, type, amount_cents, description, occurred_on) values ($1, $2, $3, 'expense', $4, 'Example', '2026-01-01')`,
            [f.user, f.account, f.category, amount],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      });
    },
  );

  it('rejects income assigned to an expense category', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      await expect(
        client.query(
          `insert into transactions (user_id, account_id, category_id, type, amount_cents, description, occurred_on) values ($1, $2, $3, 'income', 100, 'Example', '2026-01-01')`,
          [f.user, f.account, f.category],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('rejects transfers to the same account', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      await expect(
        client.query(
          `insert into transfers (user_id, source_account_id, destination_account_id, amount_cents, occurred_on) values ($1, $2, $2, 100, '2026-01-01')`,
          [f.user, f.account],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('enforces one budget per owner, category and month', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const statement = `insert into budgets (user_id, category_id, period, limit_cents) values ($1, $2, '2026-01-01', 1000)`;
      await client.query(statement, [f.user, f.category]);
      await expect(
        client.query(statement, [f.user, f.category]),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('rejects a budget period that is not the first day of a month', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      await expect(
        client.query(
          `insert into budgets (user_id, category_id, period, limit_cents) values ($1, $2, '2026-01-02', 1000)`,
          [f.user, f.category],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('enforces case-insensitive email uniqueness', async () => {
    await isolated(async (client) => {
      const email = `${randomUUID()}@example.invalid`;
      await client.query(
        `insert into users (name, email, password_hash) values ('Example', $1, 'placeholder-hash')`,
        [email],
      );
      await expect(
        client.query(
          `insert into users (name, email, password_hash) values ('Example', $1, 'placeholder-hash')`,
          [email.toUpperCase()],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('cascades sessions when an otherwise unused user is deleted', async () => {
    await isolated(async (client) => {
      const id = randomUUID();
      await client.query(
        `insert into users (id, name, email, password_hash) values ($1, 'Example', $2, 'placeholder-hash')`,
        [id, `${id}@example.invalid`],
      );
      await client.query(
        `insert into sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 day')`,
        [id, 'a'.repeat(64)],
      );
      await client.query('delete from users where id = $1', [id]);
      expect(
        (await client.query('select id from sessions where user_id = $1', [id]))
          .rowCount,
      ).toBe(0);
    });
  });

  it('rejects duplicate persisted session hashes', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const statement = `insert into sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 day')`;
      await client.query(statement, [f.user, 'b'.repeat(64)]);
      await expect(
        client.query(statement, [f.user, 'b'.repeat(64)]),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('prevents repeated generation for one recurrence occurrence', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const recurrence = randomUUID();
      await client.query(
        `insert into recurrences (id, user_id, account_id, category_id, type, description, amount_cents, frequency, starts_on, next_execution_on) values ($1, $2, $3, $4, 'expense', 'Example recurrence', 100, 'monthly', '2026-01-01', '2026-01-01')`,
        [recurrence, f.user, f.account, f.category],
      );
      const statement = `insert into transactions (user_id, account_id, category_id, type, description, amount_cents, occurred_on, recurrence_id, recurrence_on) values ($1, $2, $3, 'expense', 'Example occurrence', 100, '2026-01-02', $4, '2026-01-01')`;
      await client.query(statement, [
        f.user,
        f.account,
        f.category,
        recurrence,
      ]);
      await expect(
        client.query(statement, [f.user, f.account, f.category, recurrence]),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('accepts a complete exact allocation and resolves typed nested relations', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const p = await purchase(client, f);
      await client.query('set constraints all immediate');
      const db = drizzle(client, { schema });
      const row = await db.query.cardPurchases.findFirst({
        where: eq(schema.cardPurchases.id, p.purchaseId),
        with: { installments: { with: { invoice: true } }, category: true },
      });
      expect(row?.category.id).toBe(f.category);
      expect(row?.installments.map((part) => part.amountCents).sort()).toEqual([
        333, 333, 334,
      ]);
      expect(
        row?.installments.every((part) => part.invoice.creditCardId === f.card),
      ).toBe(true);
    });
  });

  it('rejects an incomplete purchase at the deferred constraint boundary', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      await client.query(
        `insert into card_purchases (user_id, credit_card_id, category_id, total_cents, purchased_on, description, installment_count) values ($1, $2, $3, 1000, '2026-01-05', 'Example incomplete', 3)`,
        [f.user, f.card, f.category],
      );
      await expect(
        client.query('set constraints all immediate'),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'card_purchases_complete_installments',
      });
    });
  });

  it('rejects a wrong sum of installments', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const p = await purchase(client, f);
      await client.query(
        'update card_installments set amount_cents = 333 where id = $1',
        [p.partIds[0]],
      );
      await expect(
        client.query('set constraints all immediate'),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('rejects incorrect residual distribution even when the sum matches', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const p = await purchase(client, f);
      await client.query(
        'update card_installments set amount_cents = 333 where id = $1',
        [p.partIds[0]],
      );
      await client.query(
        'update card_installments set amount_cents = 334 where id = $1',
        [p.partIds[1]],
      );
      await expect(
        client.query('set constraints all immediate'),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('enforces unique purchase installment numbers', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const p = await purchase(client, f);
      await expect(
        client.query(
          'update card_installments set installment_number = 1 where id = $1',
          [p.partIds[1]],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('rejects an invalid invoice snapshot calendar', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      await expect(
        client.query(
          `insert into invoices (user_id, credit_card_id, period, closes_on, due_on, closing_day, due_day) values ($1, $2, '2026-01-01', '2026-01-11', '2026-01-20', 10, 20)`,
          [f.user, f.card],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('enforces unique invoices per card and monthly period', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      await purchase(client, f);
      await expect(
        client.query(
          `insert into invoices (user_id, credit_card_id, period, closes_on, due_on, closing_day, due_day) values ($1, $2, '2026-01-01', '2026-01-10', '2026-01-20', 10, 20)`,
          [f.user, f.card],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('accepts a clamped February invoice without skipping a period', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      await client.query(
        `insert into invoices (user_id, credit_card_id, period, closes_on, due_on, closing_day, due_day) values ($1, $2, '2026-02-01', '2026-02-28', '2026-02-28', 28, 31)`,
        [f.user, f.card],
      );
      await client.query('set constraints all immediate');
    });
  });

  it('rejects payment amounts different from the invoice total', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const p = await purchase(client, f);
      await expect(pay(client, f, p.invoiceIds[0], 333)).rejects.toMatchObject({
        code: '23514',
        constraint: 'invoice_payments_full_settlement',
      });
    });
  });

  it('prevents duplicate invoice settlement', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const p = await purchase(client, f);
      await pay(client, f, p.invoiceIds[0]);
      await expect(pay(client, f, p.invoiceIds[0])).rejects.toMatchObject({
        code: '23505',
      });
    });
  });

  it('freezes installments of a paid invoice', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const p = await purchase(client, f);
      await pay(client, f, p.invoiceIds[0]);
      await expect(
        client.query('delete from card_installments where id = $1', [
          p.partIds[0],
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('keeps purchases with any settled installment immutable', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const p = await purchase(client, f);
      await pay(client, f, p.invoiceIds[0]);
      await expect(
        client.query('delete from card_purchases where id = $1', [
          p.purchaseId,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('derives balances, available limit and budgets without double counting', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const p = await purchase(client, f);
      const destination = randomUUID();
      await client.query(
        `insert into accounts (id, user_id, name, type) values ($1, $2, 'Example destination', 'cash')`,
        [destination, f.user],
      );
      await client.query(
        `insert into transactions (user_id, account_id, category_id, type, amount_cents, description, occurred_on) values ($1, $2, $3, 'income', 2000, 'Example income', '2026-01-01'), ($1, $2, $4, 'expense', 400, 'Example expense', '2026-01-02')`,
        [f.user, f.account, f.incomeCategory, f.category],
      );
      await client.query(
        `insert into transfers (user_id, source_account_id, destination_account_id, amount_cents, occurred_on) values ($1, $2, $3, 500, '2026-01-03')`,
        [f.user, f.account, destination],
      );
      await client.query(
        `insert into budgets (user_id, category_id, period, limit_cents) values ($1, $2, '2026-01-01', 5000)`,
        [f.user, f.category],
      );
      const goal = randomUUID();
      await client.query(
        `insert into goals (id, user_id, description, target_cents, due_on) values ($1, $2, 'Example goal', 10000, '2026-12-01')`,
        [goal, f.user],
      );
      await client.query(
        `insert into goal_contributions (user_id, goal_id, amount_cents, contributed_on) values ($1, $2, 777, '2026-01-04')`,
        [f.user, goal],
      );
      expect(
        (
          await client.query(
            'select balance_cents from account_balances where account_id = $1',
            [f.account],
          )
        ).rows,
      ).toEqual([{ balance_cents: '11100' }]);
      expect(
        (
          await client.query(
            'select available_cents from card_available_limits where credit_card_id = $1',
            [f.card],
          )
        ).rows,
      ).toEqual([{ available_cents: '9000' }]);
      expect(
        (
          await client.query(
            'select spent_cents from budget_spending where user_id = $1',
            [f.user],
          )
        ).rows,
      ).toEqual([{ spent_cents: '734' }]);
      await pay(client, f, p.invoiceIds[0]);
      await client.query('set constraints all immediate');
      expect(
        (
          await client.query(
            'select balance_cents from account_balances where account_id = $1',
            [f.account],
          )
        ).rows,
      ).toEqual([{ balance_cents: '10766' }]);
      expect(
        (
          await client.query(
            'select balance_cents from account_balances where account_id = $1',
            [destination],
          )
        ).rows,
      ).toEqual([{ balance_cents: '500' }]);
      expect(
        (
          await client.query(
            'select available_cents from card_available_limits where credit_card_id = $1',
            [f.card],
          )
        ).rows,
      ).toEqual([{ available_cents: '9334' }]);
      expect(
        (
          await client.query(
            'select spent_cents from budget_spending where user_id = $1',
            [f.user],
          )
        ).rows,
      ).toEqual([{ spent_cents: '734' }]);
      expect(
        (
          await client.query(
            'select total_cents, paid_cents, outstanding_cents from invoice_totals where invoice_id = $1',
            [p.invoiceIds[0]],
          )
        ).rows,
      ).toEqual([
        { total_cents: '334', paid_cents: '334', outstanding_cents: '0' },
      ]);
      expect(
        (
          await client.query(
            'select count(*)::integer as count from transactions where user_id = $1',
            [f.user],
          )
        ).rows,
      ).toEqual([{ count: 2 }]);
    });
  });

  it('rejects non-finite financial dates', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      await expect(
        client.query(
          `insert into transactions (user_id, account_id, category_id, type, amount_cents, description, occurred_on) values ($1, $2, $3, 'expense', 100, 'Example', 'infinity')`,
          [f.user, f.account, f.category],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('cascades deletion of an unpaid purchase without leaving incomplete aggregates', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const p = await purchase(client, f);
      await client.query('delete from card_purchases where id = $1', [
        p.purchaseId,
      ]);
      await client.query('set constraints all immediate');
      expect(
        (
          await client.query(
            'select id from card_installments where purchase_id = $1',
            [p.purchaseId],
          )
        ).rowCount,
      ).toBe(0);
    });
  });

  it('requires consecutive invoice periods for the installments', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const p = await purchase(client, f);
      await client.query(
        'update card_installments set invoice_id = $1 where id = $2',
        [p.invoiceIds[2], p.partIds[1]],
      );
      await expect(
        client.query('set constraints all immediate'),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'card_purchases_invoice_sequence',
      });
    });
  });

  it('rejects an invoice total above the safe JSON integer limit', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      await purchase(client, f, Number.MAX_SAFE_INTEGER, 1);
      await purchase(client, f, Number.MAX_SAFE_INTEGER, 1);
      await expect(
        client.query('set constraints all immediate'),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'invoices_total_safe',
      });
    });
  });

  it('rejects a payment from another owner account', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const p = await purchase(client, f);
      await expect(
        pay(client, { ...f, account: f.otherAccount }, p.invoiceIds[0]),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('keeps recorded settlements immutable', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      const p = await purchase(client, f);
      await pay(client, f, p.invoiceIds[0]);
      await expect(
        client.query('delete from invoice_payments where invoice_id = $1', [
          p.invoiceIds[0],
        ]),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'invoice_payments_immutable',
      });
    });
  });

  // These cases commit only fictional fixtures in the disposable test database.
  it.each(['read committed', 'repeatable read'])(
    'allows exactly one concurrent settlement at %s',
    async (level) => {
      const setup = await pool.connect();
      let f: Fixture;
      let p: Awaited<ReturnType<typeof purchase>>;
      try {
        await setup.query('begin');
        f = await fixture(setup);
        p = await purchase(setup, f);
        await setup.query('commit');
      } finally {
        await setup.query('rollback');
        setup.release();
      }
      const clients = await Promise.all([pool.connect(), pool.connect()]);
      try {
        await Promise.all(
          clients.map((client) =>
            client.query(`begin isolation level ${level}`),
          ),
        );
        const attempts = await Promise.allSettled(
          clients.map(async (client) => {
            try {
              await pay(client, f, p.invoiceIds[0]);
              await client.query('commit');
            } catch (error) {
              await client.query('rollback');
              throw error;
            }
          }),
        );
        expect(
          attempts.filter((attempt) => attempt.status === 'fulfilled'),
        ).toHaveLength(1);
        const failure = attempts.find(
          (attempt) => attempt.status === 'rejected',
        );
        expect(
          failure?.status === 'rejected' &&
            ['23505', '40001'].includes(failure.reason.code),
        ).toBe(true);
        expect(
          (
            await pool.query(
              'select count(*)::integer as count from invoice_payments where invoice_id = $1',
              [p.invoiceIds[0]],
            )
          ).rows,
        ).toEqual([{ count: 1 }]);
        expect(
          (
            await pool.query(
              'select balance_cents from account_balances where account_id = $1',
              [f.account],
            )
          ).rows,
        ).toEqual([{ balance_cents: '9666' }]);
      } finally {
        for (const client of clients) {
          await client.query('rollback');
          client.release();
        }
      }
    },
  );

  it('serializes a full settlement against concurrent installment changes', async () => {
    const setup = await pool.connect();
    let f: Fixture;
    let p: Awaited<ReturnType<typeof purchase>>;
    try {
      await setup.query('begin');
      f = await fixture(setup);
      p = await purchase(setup, f);
      await setup.query('commit');
    } finally {
      await setup.query('rollback');
      setup.release();
    }
    const payer = await pool.connect();
    const editor = await pool.connect();
    try {
      await payer.query('begin');
      await editor.query('begin');
      const attempts = await Promise.allSettled([
        (async () => {
          try {
            await pay(payer, f, p.invoiceIds[0]);
            await payer.query('commit');
          } catch (error) {
            await payer.query('rollback');
            throw error;
          }
        })(),
        (async () => {
          try {
            await editor.query(
              'update card_purchases set total_cents = 1003 where id = $1',
              [p.purchaseId],
            );
            await editor.query(
              'update card_installments set amount_cents = case when installment_number = 1 then 335 else 334 end where purchase_id = $1',
              [p.purchaseId],
            );
            await editor.query('commit');
          } catch (error) {
            await editor.query('rollback');
            throw error;
          }
        })(),
      ]);
      expect(
        attempts.filter((attempt) => attempt.status === 'fulfilled'),
      ).toHaveLength(1);
      const result = await pool.query(
        'select total_cents, paid_cents from invoice_totals where invoice_id = $1',
        [p.invoiceIds[0]],
      );
      expect(result.rows[0]).toEqual(
        expect.objectContaining({
          total_cents: result.rows[0]?.paid_cents === '0' ? '335' : '334',
        }),
      );
    } finally {
      await payer.query('rollback');
      await editor.query('rollback');
      payer.release();
      editor.release();
    }
  });

  it('restricts deletion of accounts referenced by financial records', async () => {
    await isolated(async (client) => {
      const f = await fixture(client);
      await client.query(
        `insert into transactions (user_id, account_id, category_id, type, amount_cents, description, occurred_on) values ($1, $2, $3, 'expense', 100, 'Example', '2026-01-01')`,
        [f.user, f.account, f.category],
      );
      await expect(
        client.query('delete from accounts where id = $1', [f.account]),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });
});
