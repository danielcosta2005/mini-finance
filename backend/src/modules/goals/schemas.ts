import { z } from 'zod';
import { positiveCentsSchema } from '../../shared/money.js';
import {
  dateRangeShape,
  descriptionSchema,
  financialDateSchema,
  hasPatch,
  paginationShape,
  validDateRange,
} from '../../shared/validation.js';

export const createGoalSchema = z.strictObject({
  description: descriptionSchema,
  targetCents: positiveCentsSchema,
  dueOn: financialDateSchema,
});
export const updateGoalSchema = createGoalSchema
  .partial()
  .refine(hasPatch, 'Informe uma alteração');
export const goalsQuerySchema = z
  .strictObject({ ...paginationShape, ...dateRangeShape })
  .refine(validDateRange, 'Intervalo inválido');
export const contributionSchema = z.strictObject({
  amountCents: positiveCentsSchema,
  contributedOn: financialDateSchema.optional(),
});
export const contributionsQuerySchema = goalsQuerySchema;
export type CreateGoal = z.output<typeof createGoalSchema>;
export type UpdateGoal = z.output<typeof updateGoalSchema>;
export type GoalsQuery = z.output<typeof goalsQuerySchema>;
export type CreateContribution = z.output<typeof contributionSchema>;
