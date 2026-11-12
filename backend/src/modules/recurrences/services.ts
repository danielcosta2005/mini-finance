import type { Recurrence } from '../../db/schema/types.js';
import { businessRule, notFound } from '../../shared/api-error.js';
import { type Clock, systemClock, today } from '../../shared/clock.js';
import { paginated } from '../../shared/http.js';
import type { RecurrencesRepository } from './repositories.js';
import type {
  CreateRecurrence,
  RecurrencesQuery,
  UpdateRecurrence,
} from './schemas.js';

type Schedule = Pick<Recurrence, 'startsOn' | 'frequency' | 'intervalCount'>;
const dayMs = 86_400_000;
function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}
// Every occurrence is derived from startsOn; February never changes the day-31 anchor.
function occurrenceAt(schedule: Schedule, index: number): string | undefined {
  const anchor = utcDate(schedule.startsOn);
  if (schedule.frequency === 'daily' || schedule.frequency === 'weekly') {
    anchor.setUTCDate(
      anchor.getUTCDate() +
        index *
          schedule.intervalCount *
          (schedule.frequency === 'weekly' ? 7 : 1),
    );
  } else {
    const months =
      index *
      schedule.intervalCount *
      (schedule.frequency === 'yearly' ? 12 : 1);
    const monthIndex =
      anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() + months;
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    const last = new Date(0);
    last.setUTCFullYear(year, month + 1, 0);
    anchor.setUTCFullYear(
      year,
      month,
      Math.min(anchor.getUTCDate(), last.getUTCDate()),
    );
  }
  const year = anchor.getUTCFullYear();
  if (year < 1 || year > 9999) return undefined;
  return anchor.toISOString().slice(0, 10);
}
export function nextOccurrenceAfter(
  schedule: Schedule,
  date: string,
): string | undefined {
  if (date < schedule.startsOn) return schedule.startsOn;
  const anchor = utcDate(schedule.startsOn);
  const reference = utcDate(date);
  const steps =
    schedule.frequency === 'daily' || schedule.frequency === 'weekly'
      ? Math.floor((reference.getTime() - anchor.getTime()) / dayMs) /
        (schedule.intervalCount * (schedule.frequency === 'weekly' ? 7 : 1))
      : ((reference.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
          reference.getUTCMonth() -
          anchor.getUTCMonth()) /
        (schedule.intervalCount * (schedule.frequency === 'yearly' ? 12 : 1));
  let index = Math.max(0, Math.floor(steps));
  let candidate = occurrenceAt(schedule, index);
  while (candidate && candidate <= date)
    candidate = occurrenceAt(schedule, ++index);
  return candidate;
}

export function createRecurrencesService(
  repo: RecurrencesRepository,
  clock: Clock = systemClock,
  timeZone = 'America/Sao_Paulo',
) {
  const related = async (
    scope: Pick<RecurrencesRepository, 'account' | 'category'>,
    userId: string,
    input: {
      accountId: string;
      categoryId: string;
      type: 'income' | 'expense';
    },
  ) => {
    const [account, category] = await Promise.all([
      scope.account(userId, input.accountId),
      scope.category(userId, input.categoryId),
    ]);
    if (!account || !category) throw notFound();
    if (category.type !== input.type)
      throw businessRule('Categoria incompatível com o tipo de lançamento');
  };
  return {
    async list(userId: string, query: RecurrencesQuery) {
      if (query.accountId && !(await repo.account(userId, query.accountId)))
        throw notFound();
      if (query.categoryId && !(await repo.category(userId, query.categoryId)))
        throw notFound();
      const result = await repo.list(userId, query);
      return paginated(result.rows, result.total, query);
    },
    async get(userId: string, id: string) {
      const item = await repo.find(userId, id);
      if (!item) throw notFound();
      return item;
    },
    async create(userId: string, input: CreateRecurrence) {
      return repo.transaction(async (scope) => {
        await related(scope, userId, input);
        return scope.create({
          ...input,
          userId,
          nextExecutionOn: input.startsOn,
        });
      });
    },
    async update(userId: string, id: string, input: UpdateRecurrence) {
      return repo.transaction(async (scope) => {
        const existing = await scope.lock(userId, id);
        if (!existing) throw notFound();
        const merged: Recurrence = {
          ...existing,
          accountId: input.accountId ?? existing.accountId,
          categoryId: input.categoryId ?? existing.categoryId,
          type: input.type ?? existing.type,
          description: input.description ?? existing.description,
          amountCents: input.amountCents ?? existing.amountCents,
          frequency: input.frequency ?? existing.frequency,
          intervalCount: input.intervalCount ?? existing.intervalCount,
          startsOn: input.startsOn ?? existing.startsOn,
          endsOn: input.endsOn === undefined ? existing.endsOn : input.endsOn,
          status: input.status ?? existing.status,
        };
        if (merged.endsOn && merged.endsOn < merged.startsOn)
          throw businessRule('Prazo anterior ao início da recorrência');
        await related(scope, userId, merged);
        const changedSchedule =
          input.startsOn !== undefined ||
          input.frequency !== undefined ||
          input.intervalCount !== undefined;
        let nextExecutionOn = existing.nextExecutionOn;
        let calendarExhausted = false;
        if (changedSchedule) {
          const latest = await scope.latestOccurrence(userId, id);
          // The stored cursor also protects progress when a generated entry was deleted.
          const previousDay = utcDate(existing.nextExecutionOn);
          previousDay.setUTCDate(previousDay.getUTCDate() - 1);
          const cursorFloor = previousDay.toISOString().slice(0, 10);
          const floor = latest && latest > cursorFloor ? latest : cursorFloor;
          const next =
            !latest && existing.nextExecutionOn === existing.startsOn
              ? merged.startsOn
              : nextOccurrenceAfter(merged, floor);
          calendarExhausted = next === undefined;
          nextExecutionOn = next ?? '9999-12-31';
        }
        const status =
          calendarExhausted ||
          (merged.endsOn && nextExecutionOn > merged.endsOn)
            ? 'completed'
            : merged.status;
        return scope.update(userId, id, {
          ...merged,
          nextExecutionOn,
          status,
          updatedAt: clock.now(),
        });
      });
    },
    async delete(userId: string, id: string) {
      return repo.transaction(async (scope) => {
        if (!(await scope.lock(userId, id))) throw notFound();
        await scope.delete(userId, id);
        return { id, deleted: true };
      });
    },
    async process(userId: string) {
      const reference = today(clock, timeZone);
      return repo.transaction(async (scope) => {
        const rules = await scope.lockDue(userId, reference, 100);
        let createdTransactions = 0;
        let processedOccurrences = 0;
        let processedRules = 0;
        for (const rule of rules) {
          if (processedOccurrences >= 1000) break;
          let nextExecutionOn = rule.nextExecutionOn;
          let completed = false;
          while (
            nextExecutionOn <= reference &&
            (!rule.endsOn || nextExecutionOn <= rule.endsOn) &&
            processedOccurrences < 1000
          ) {
            const created = await scope.insertOccurrence({
              userId,
              accountId: rule.accountId,
              categoryId: rule.categoryId,
              type: rule.type,
              amountCents: rule.amountCents,
              description: rule.description,
              occurredOn: nextExecutionOn,
              recurrenceId: rule.id,
              recurrenceOn: nextExecutionOn,
            });
            if (created) createdTransactions++;
            processedOccurrences++;
            const following = nextOccurrenceAfter(rule, nextExecutionOn);
            if (!following) {
              completed = true;
              break;
            }
            nextExecutionOn = following;
          }
          await scope.update(userId, rule.id, {
            nextExecutionOn,
            status:
              completed || (rule.endsOn && nextExecutionOn > rule.endsOn)
                ? 'completed'
                : rule.status,
            updatedAt: clock.now(),
          });
          processedRules++;
        }
        return {
          processedRules,
          processedOccurrences,
          createdTransactions,
          more: await scope.hasDue(userId, reference),
          limits: { rules: 100, occurrences: 1000 },
        };
      });
    },
  };
}
export type RecurrencesService = ReturnType<typeof createRecurrencesService>;
