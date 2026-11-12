import type { Goal } from '../../db/schema/types.js';
import { notFound } from '../../shared/api-error.js';
import { type Clock, systemClock, today } from '../../shared/clock.js';
import { paginated, percentage, safeCents } from '../../shared/http.js';
import type { GoalsRepository } from './repositories.js';
import type {
  CreateContribution,
  CreateGoal,
  GoalsQuery,
  UpdateGoal,
} from './schemas.js';

export function createGoalsService(
  repo: GoalsRepository,
  clock: Clock = systemClock,
  timeZone = 'America/Sao_Paulo',
) {
  const present = ({
    goal,
    contributedCents,
  }: {
    goal: Goal;
    contributedCents: string;
  }) => ({
    ...goal,
    contributedCents: safeCents(contributedCents),
    remainingCents: safeCents(
      BigInt(goal.targetCents) > BigInt(contributedCents)
        ? BigInt(goal.targetCents) - BigInt(contributedCents)
        : 0n,
    ),
    progressPercentage: percentage(contributedCents, goal.targetCents),
    achieved: BigInt(contributedCents) >= BigInt(goal.targetCents),
    overdue:
      goal.dueOn < today(clock, timeZone) &&
      BigInt(contributedCents) < BigInt(goal.targetCents),
  });
  const find = async (userId: string, id: string) => {
    const item = await repo.find(userId, id);
    if (!item) throw notFound();
    return item;
  };
  return {
    async list(userId: string, query: GoalsQuery) {
      const result = await repo.list(userId, query);
      return paginated(result.rows.map(present), result.total, query);
    },
    async get(userId: string, id: string) {
      return present(await find(userId, id));
    },
    async create(userId: string, input: CreateGoal) {
      const goal = await repo.create({ ...input, userId });
      if (!goal) throw notFound();
      return present({ goal, contributedCents: '0' });
    },
    async update(userId: string, id: string, input: UpdateGoal) {
      const result = await repo.update(userId, id, input, clock.now());
      if (!result) throw notFound();
      return present(await find(userId, id));
    },
    async delete(userId: string, id: string) {
      if (!(await repo.delete(userId, id))) throw notFound();
      return { id, deleted: true };
    },
    async contributions(userId: string, id: string, query: GoalsQuery) {
      await find(userId, id);
      const result = await repo.contributions(userId, id, query);
      return paginated(result.rows, result.total, query);
    },
    async contribute(userId: string, id: string, input: CreateContribution) {
      await find(userId, id);
      return repo.contribute({
        userId,
        goalId: id,
        amountCents: input.amountCents,
        contributedOn: input.contributedOn ?? today(clock, timeZone),
      });
    },
  };
}
export type GoalsService = ReturnType<typeof createGoalsService>;
