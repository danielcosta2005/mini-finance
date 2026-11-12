import { z } from 'zod';
import { positiveCentsSchema } from '../../shared/money.js';
import {
  hasPatch,
  monthSchema,
  paginationShape,
} from '../../shared/validation.js';

export const createBudgetSchema = z.strictObject({
  categoryId: z.uuid(),
  month: monthSchema,
  limitCents: positiveCentsSchema,
});
export const patchBudgetSchema = createBudgetSchema
  .partial()
  .refine(hasPatch, 'Informe uma alteração');
export const budgetsQuerySchema = z.strictObject({
  ...paginationShape,
  month: monthSchema.optional(),
  categoryId: z.uuid().optional(),
  sortBy: z.enum(['month', 'limit', 'createdAt']).default('month'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type CreateBudget = z.infer<typeof createBudgetSchema>;
export type PatchBudget = z.infer<typeof patchBudgetSchema>;
export type BudgetsQuery = z.infer<typeof budgetsQuerySchema>;
