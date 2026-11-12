import type { Account, Transfer } from '../../db/schema/types.js';
import { notFound } from '../../shared/api-error.js';
import { paginated, safeCents } from '../../shared/http.js';
import type { AccountsRepository } from './repositories.js';
import type {
  AccountsQuery,
  CreateAccount,
  CreateTransfer,
  PatchAccount,
  TransfersQuery,
} from './schemas.js';

const present = (row: { account: Account; balanceCents: string }) => ({
  ...row.account,
  openingBalanceCents: safeCents(row.account.openingBalanceCents),
  balanceCents: safeCents(row.balanceCents),
});
const presentTransfer = (row: Transfer) => ({
  ...row,
  amountCents: safeCents(row.amountCents),
});
export function createAccountsService(repository: AccountsRepository) {
  async function get(
    userId: string,
    id: string,
    scope: Pick<AccountsRepository, 'get'> = repository,
  ) {
    const row = await scope.get(userId, id);
    if (!row) throw notFound();
    return present(row);
  }
  return {
    get,
    async list(userId: string, query: AccountsQuery) {
      const result = await repository.list(userId, query);
      return paginated(result.rows.map(present), result.total, query);
    },
    async create(userId: string, input: CreateAccount) {
      return repository.transaction(async (scope) => {
        const row = await scope.create(userId, input);
        if (!row) throw new Error('Account insert failed');
        return get(userId, row.id, scope);
      });
    },
    async update(userId: string, id: string, input: PatchAccount) {
      return repository.transaction(async (scope) => {
        const row = await scope.update(userId, id, input);
        if (!row) throw notFound();
        return get(userId, id, scope);
      });
    },
    async delete(userId: string, id: string) {
      const row = await repository.delete(userId, id);
      if (!row) throw notFound();
      return { id, deleted: true };
    },
    async createTransfer(userId: string, input: CreateTransfer) {
      const row = await repository.createTransfer(userId, input);
      if (!row) throw new Error('Transfer insert failed');
      return presentTransfer(row);
    },
    async listTransfers(userId: string, query: TransfersQuery) {
      if (query.accountId) await get(userId, query.accountId);
      const result = await repository.listTransfers(userId, query);
      return paginated(result.rows.map(presentTransfer), result.total, query);
    },
  };
}
export type AccountsService = ReturnType<typeof createAccountsService>;
