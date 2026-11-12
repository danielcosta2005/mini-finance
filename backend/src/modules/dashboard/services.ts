import {
  type Clock,
  monthRange,
  shiftMonth,
  systemClock,
  today,
} from '../../shared/clock.js';
import { percentage, safeCents } from '../../shared/http.js';
import type { DashboardRepository } from './repositories.js';
import type { DashboardQuery } from './schemas.js';

export function createDashboardService(
  repo: DashboardRepository,
  clock: Clock = systemClock,
  timeZone = 'America/Sao_Paulo',
) {
  return {
    async get(userId: string, query: DashboardQuery) {
      const month = query.month ?? today(clock, timeZone).slice(0, 7);
      // Keep the visible history inside the accepted financial date range.
      const earliest =
        Number(month.slice(0, 4)) === 1 && Number(month.slice(5, 7)) < 12
          ? '0001-01'
          : shiftMonth(month, -11);
      const { endExclusive } = monthRange(month);
      const [balances, direct, installments, budgetRows] = await Promise.all([
        repo.accountBalances(userId),
        repo.transactionTotals(userId, `${earliest}-01`, endExclusive),
        repo.installmentTotals(userId, `${earliest}-01`, endExclusive),
        repo.budgets(userId, `${month}-01`),
      ]);
      const monthly = new Map<string, { income: bigint; expense: bigint }>();
      const grouped = new Map<
        string,
        {
          categoryId: string;
          name: string;
          type: 'income' | 'expense';
          amount: bigint;
        }
      >();
      const add = (
        row: {
          month: string;
          categoryId: string;
          categoryName: string;
          amountCents: string;
        },
        type: 'income' | 'expense',
      ) => {
        const amount = BigInt(row.amountCents);
        const total = monthly.get(row.month) ?? { income: 0n, expense: 0n };
        total[type] += amount;
        monthly.set(row.month, total);
        if (row.month === month) {
          const key = `${type}:${row.categoryId}`;
          const category = grouped.get(key) ?? {
            categoryId: row.categoryId,
            name: row.categoryName,
            type,
            amount: 0n,
          };
          category.amount += amount;
          grouped.set(key, category);
        }
      };
      for (const row of direct) add(row, row.type);
      for (const row of installments) add(row, 'expense');
      const selected = monthly.get(month) ?? { income: 0n, expense: 0n };
      const evolution = [];
      for (let index = 0; index < 12; index++) {
        const period = shiftMonth(earliest, index);
        if (period > month) break;
        const total = monthly.get(period) ?? { income: 0n, expense: 0n };
        evolution.push({
          month: period,
          incomeCents: safeCents(total.income),
          expenseCents: safeCents(total.expense),
          netCents: safeCents(total.income - total.expense),
        });
      }
      const categories = [...grouped.values()]
        .sort((a, b) =>
          a.amount === b.amount
            ? a.categoryId.localeCompare(b.categoryId)
            : a.amount > b.amount
              ? -1
              : 1,
        )
        .map((item) => ({
          categoryId: item.categoryId,
          name: item.name,
          type: item.type,
          amountCents: safeCents(item.amount),
          percentage: percentage(item.amount, selected[item.type]),
        }));
      const items = budgetRows.map((item) => {
        const remaining = BigInt(item.limitCents) - BigInt(item.spentCents);
        return {
          ...item,
          spentCents: safeCents(item.spentCents),
          remainingCents: safeCents(remaining),
          progressPercentage: percentage(item.spentCents, item.limitCents),
          exceeded: remaining < 0n,
        };
      });
      const budgetLimit = budgetRows.reduce(
        (sum, item) => sum + BigInt(item.limitCents),
        0n,
      );
      const budgetSpent = budgetRows.reduce(
        (sum, item) => sum + BigInt(item.spentCents),
        0n,
      );
      return {
        month,
        totals: {
          balanceCents: safeCents(
            balances.reduce(
              (sum, account) => sum + BigInt(account.balanceCents),
              0n,
            ),
          ),
          incomeCents: safeCents(selected.income),
          expenseCents: safeCents(selected.expense),
          netCents: safeCents(selected.income - selected.expense),
        },
        accounts: balances.map((account) => ({
          ...account,
          balanceCents: safeCents(account.balanceCents),
        })),
        categories,
        evolution,
        budgets: {
          limitCents: safeCents(budgetLimit),
          spentCents: safeCents(budgetSpent),
          remainingCents: safeCents(budgetLimit - budgetSpent),
          progressPercentage: percentage(budgetSpent, budgetLimit),
          overBudgetCount: items.filter((item) => item.exceeded).length,
          items,
        },
      };
    },
  };
}
export type DashboardService = ReturnType<typeof createDashboardService>;
