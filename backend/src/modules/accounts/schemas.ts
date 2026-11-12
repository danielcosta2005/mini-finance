import { z } from 'zod';
import { centsSchema, positiveCentsSchema } from '../../shared/money.js';
import {
  dateRangeShape,
  financialDateSchema,
  hasPatch,
  nameSchema,
  paginationShape,
  validDateRange,
} from '../../shared/validation.js';

const fields = {
  name: nameSchema,
  type: z.enum(['checking', 'savings', 'cash', 'investment', 'other']),
  openingBalanceCents: centsSchema,
};
export const createAccountSchema = z.strictObject({
  ...fields,
  openingBalanceCents: fields.openingBalanceCents.default(0),
});
export const patchAccountSchema = z
  .strictObject(fields)
  .partial()
  .refine(hasPatch, 'Informe ao menos um campo');
export const accountsQuerySchema = z.strictObject({
  ...paginationShape,
  type: fields.type.optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export const createTransferSchema = z
  .strictObject({
    sourceAccountId: z.uuid(),
    destinationAccountId: z.uuid(),
    amountCents: positiveCentsSchema,
    occurredOn: financialDateSchema,
    description: z.string().trim().max(500).optional(),
  })
  .refine(
    (value) => value.sourceAccountId !== value.destinationAccountId,
    'Contas devem ser diferentes',
  );
export const transfersQuerySchema = z
  .strictObject({
    ...paginationShape,
    ...dateRangeShape,
    accountId: z.uuid().optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine(validDateRange);
export type CreateAccount = z.infer<typeof createAccountSchema>;
export type PatchAccount = z.infer<typeof patchAccountSchema>;
export type AccountsQuery = z.infer<typeof accountsQuerySchema>;
export type CreateTransfer = z.infer<typeof createTransferSchema>;
export type TransfersQuery = z.infer<typeof transfersQuerySchema>;
