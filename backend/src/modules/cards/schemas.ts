import { z } from 'zod';
import { centsSchema, positiveCentsSchema } from '../../shared/money.js';
import {
  dateRangeShape,
  descriptionSchema,
  financialDateSchema,
  hasPatch,
  monthSchema,
  nameSchema,
  paginationShape,
  validDateRange,
} from '../../shared/validation.js';

const cardShape = {
  name: nameSchema,
  creditLimitCents: centsSchema.nonnegative(),
  closingDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
};
export const createCardSchema = z.strictObject(cardShape);
export const updateCardSchema = createCardSchema
  .partial()
  .refine(hasPatch, 'Informe ao menos um campo');
export const cardsQuerySchema = z.strictObject(paginationShape);
export const createPurchaseSchema = z
  .strictObject({
    categoryId: z.uuid(),
    totalCents: positiveCentsSchema,
    purchasedOn: financialDateSchema,
    description: descriptionSchema,
    // Bound work per request while retaining up to thirty years of monthly installments.
    installmentCount: z.number().int().min(1).max(360).default(1),
  })
  .refine(
    (value) => value.installmentCount <= value.totalCents,
    'Cada parcela deve conter pelo menos um centavo',
  );
export const purchasesQuerySchema = z
  .strictObject({
    ...paginationShape,
    ...dateRangeShape,
    categoryId: z.uuid().optional(),
  })
  .refine(validDateRange, 'Intervalo de datas inválido');
export const invoicesQuerySchema = z.strictObject({
  ...paginationShape,
  month: monthSchema.optional(),
});
export const payInvoiceSchema = z.strictObject({
  accountId: z.uuid(),
  paidOn: financialDateSchema.optional(),
});
export type CreateCard = z.infer<typeof createCardSchema>;
export type UpdateCard = z.infer<typeof updateCardSchema>;
export type CreatePurchase = z.infer<typeof createPurchaseSchema>;
export type CardsQuery = z.infer<typeof cardsQuerySchema>;
export type PurchasesQuery = z.infer<typeof purchasesQuerySchema>;
export type InvoicesQuery = z.infer<typeof invoicesQuerySchema>;
export type PayInvoice = z.infer<typeof payInvoiceSchema>;
