import type { Transaction } from '../../db/schema/types.js';
import { businessRule, notFound } from '../../shared/api-error.js';
import { paginated, safeCents } from '../../shared/http.js';
import type { TransactionsRepository } from './repositories.js';
import type {
  CreateTransaction,
  PatchTransaction,
  TransactionsQuery,
} from './schemas.js';

function present(transaction: Transaction) {
  return { ...transaction, amountCents: safeCents(transaction.amountCents) };
}

export function createTransactionsService(repository: TransactionsRepository) {
  async function references(userId: string, input: CreateTransaction) {
    const [account, category] = await Promise.all([
      repository.findAccount(userId, input.accountId),
      repository.findCategory(userId, input.categoryId),
    ]);
    if (!account || !category) throw notFound();
    if (category.type !== input.type)
      throw businessRule('Categoria incompatível com o tipo da transação');
  }
  return {
    async list(userId: string, query: TransactionsQuery) {
      if (
        query.accountId &&
        !(await repository.findAccount(userId, query.accountId))
      )
        throw notFound();
      if (
        query.categoryId &&
        !(await repository.findCategory(userId, query.categoryId))
      )
        throw notFound();
      const result = await repository.list(userId, query);
      return paginated(result.data.map(present), result.total, {
        page: query.page,
        pageSize: query.pageSize,
      });
    },
    async get(userId: string, id: string) {
      const transaction = await repository.find(userId, id);
      if (!transaction) throw notFound();
      return present(transaction);
    },
    async create(userId: string, input: CreateTransaction) {
      await references(userId, input);
      const transaction = await repository.create(userId, input);
      if (!transaction) throw notFound();
      return present(transaction);
    },
    async update(userId: string, id: string, input: PatchTransaction) {
      const current = await repository.find(userId, id);
      if (!current) throw notFound();
      const merged: CreateTransaction = {
        accountId: input.accountId ?? current.accountId,
        categoryId: input.categoryId ?? current.categoryId,
        type: input.type ?? current.type,
        amountCents: input.amountCents ?? current.amountCents,
        description: input.description ?? current.description,
        occurredOn: input.occurredOn ?? current.occurredOn,
      };
      await references(userId, merged);
      const transaction = await repository.update(userId, id, input);
      if (!transaction) throw notFound();
      return present(transaction);
    },
    async delete(userId: string, id: string) {
      const transaction = await repository.delete(userId, id);
      if (!transaction) throw notFound();
      return { id: transaction.id, deleted: true as const };
    },
  };
}
export type TransactionsService = ReturnType<typeof createTransactionsService>;
