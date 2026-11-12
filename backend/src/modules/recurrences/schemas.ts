import { z } from 'zod';
import {
  recurrenceFrequency,
  recurrenceStatus,
  transactionType,
} from '../../db/schema/index.js';
import { positiveCentsSchema } from '../../shared/money.js';
import {
  descriptionSchema,
  financialDateSchema,
  hasPatch,
  paginationShape,
} from '../../shared/validation.js';

const recurrenceShape = {
  accountId: z.uuid(),
  categoryId: z.uuid(),
  type: z.enum(transactionType.enumValues),
  description: descriptionSchema,
  amountCents: positiveCentsSchema,
  frequency: z.enum(recurrenceFrequency.enumValues),
  intervalCount: z.number().int().min(1).max(1200),
  startsOn: financialDateSchema,
  endsOn: financialDateSchema.nullable().optional(),
  status: z.enum(recurrenceStatus.enumValues),
};
export const createRecurrenceSchema = z
  .strictObject({
    ...recurrenceShape,
    frequency: recurrenceShape.frequency.default('monthly'),
    intervalCount: recurrenceShape.intervalCount.default(1),
    status: recurrenceShape.status.default('active'),
  })
  .refine(
    (value) => !value.endsOn || value.endsOn >= value.startsOn,
    'Prazo anterior ao início',
  );
export const updateRecurrenceSchema = z
  .strictObject(recurrenceShape)
  .partial()
  .refine(hasPatch, 'Informe uma alteração');
export const recurrencesQuerySchema = z.strictObject({
  ...paginationShape,
  accountId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  type: z.enum(transactionType.enumValues).optional(),
  status: z.enum(recurrenceStatus.enumValues).optional(),
});
export const processRecurrencesSchema = z.strictObject({});
export type CreateRecurrence = z.output<typeof createRecurrenceSchema>;
export type UpdateRecurrence = z.output<typeof updateRecurrenceSchema>;
export type RecurrencesQuery = z.output<typeof recurrencesQuerySchema>;
