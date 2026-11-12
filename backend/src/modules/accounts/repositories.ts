import { and, asc, count, desc, eq, gte, inArray, lte, or } from 'drizzle-orm';
import { accountBalances, accounts, transfers } from '../../db/schema/index.js';
import type { Database } from '../../db/types.js';
import { notFound } from '../../shared/api-error.js';
import { withTransaction } from '../../shared/transaction.js';
import type {
  AccountsQuery,
  CreateAccount,
  CreateTransfer,
  PatchAccount,
  TransfersQuery,
} from './schemas.js';

export function createAccountsRepository(db: Database) {
  const owns = (userId: string, id: string) =>
    and(eq(accounts.userId, userId), eq(accounts.id, id));
  return {
    async get(userId: string, id: string) {
      return (
        await db
          .select({
            account: accounts,
            balanceCents: accountBalances.balanceCents,
          })
          .from(accounts)
          .innerJoin(
            accountBalances,
            and(
              eq(accounts.id, accountBalances.accountId),
              eq(accountBalances.userId, userId),
            ),
          )
          .where(owns(userId, id))
          .limit(1)
      )[0];
    },
    async list(userId: string, query: AccountsQuery) {
      const where = and(
        eq(accounts.userId, userId),
        query.type ? eq(accounts.type, query.type) : undefined,
      );
      const order = query.order === 'asc' ? asc : desc;
      const rows = await db
        .select({
          account: accounts,
          balanceCents: accountBalances.balanceCents,
        })
        .from(accounts)
        .innerJoin(
          accountBalances,
          and(
            eq(accounts.id, accountBalances.accountId),
            eq(accountBalances.userId, userId),
          ),
        )
        .where(where)
        .orderBy(order(accounts.name), asc(accounts.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const [total] = await db
        .select({ value: count() })
        .from(accounts)
        .where(where);
      return { rows, total: total?.value ?? 0 };
    },
    async create(userId: string, input: CreateAccount) {
      return (
        await db
          .insert(accounts)
          .values({ ...input, userId })
          .returning()
      )[0];
    },
    async update(userId: string, id: string, input: PatchAccount) {
      return (
        await db.update(accounts).set(input).where(owns(userId, id)).returning()
      )[0];
    },
    async delete(userId: string, id: string) {
      return (
        await db
          .delete(accounts)
          .where(owns(userId, id))
          .returning({ id: accounts.id })
      )[0];
    },
    async createTransfer(userId: string, input: CreateTransfer) {
      return withTransaction(db, async (tx) => {
        const owned = await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.userId, userId),
              inArray(accounts.id, [
                input.sourceAccountId,
                input.destinationAccountId,
              ]),
            ),
          )
          .orderBy(asc(accounts.id))
          .for('update');
        if (owned.length !== 2) throw notFound('Conta não encontrada');
        return (
          await tx
            .insert(transfers)
            .values({ ...input, userId })
            .returning()
        )[0];
      });
    },
    async listTransfers(userId: string, query: TransfersQuery) {
      const where = and(
        eq(transfers.userId, userId),
        query.from ? gte(transfers.occurredOn, query.from) : undefined,
        query.to ? lte(transfers.occurredOn, query.to) : undefined,
        query.accountId
          ? or(
              eq(transfers.sourceAccountId, query.accountId),
              eq(transfers.destinationAccountId, query.accountId),
            )
          : undefined,
      );
      const rows = await db
        .select()
        .from(transfers)
        .where(where)
        .orderBy(
          query.order === 'asc'
            ? asc(transfers.occurredOn)
            : desc(transfers.occurredOn),
          asc(transfers.id),
        )
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const [total] = await db
        .select({ value: count() })
        .from(transfers)
        .where(where);
      return { rows, total: total?.value ?? 0 };
    },
  };
}
export type AccountsRepository = ReturnType<typeof createAccountsRepository>;
