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

export const transactionTypeSchema = z.enum(['income', 'expense']);
export const createTransactionSchema = z.strictObject({
  accountId: z.uuid(),
  categoryId: z.uuid(),
  type: transactionTypeSchema,
  amountCents: positiveCentsSchema,
  description: descriptionSchema,
  occurredOn: financialDateSchema,
});
export const patchTransactionSchema = createTransactionSchema
  .partial()
  .refine(hasPatch, 'Informe uma alteração');
export const transactionsQuerySchema = z
  .strictObject({
    ...paginationShape,
    ...dateRangeShape,
    accountId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    type: transactionTypeSchema.optional(),
    sortBy: z.enum(['date', 'amount', 'createdAt']).default('date'),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine(validDateRange, 'Intervalo de datas inválido');
export type CreateTransaction = z.infer<typeof createTransactionSchema>;
export type PatchTransaction = z.infer<typeof patchTransactionSchema>;
export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;
