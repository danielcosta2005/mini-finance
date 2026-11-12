import { z } from 'zod';
import {
  hasPatch,
  nameSchema,
  paginationShape,
} from '../../shared/validation.js';

export const categoryTypeSchema = z.enum(['income', 'expense']);
export const createCategorySchema = z.strictObject({
  name: nameSchema,
  type: categoryTypeSchema,
});
export const patchCategorySchema = createCategorySchema
  .partial()
  .refine(hasPatch, 'Informe uma alteração');
export const categoriesQuerySchema = z.strictObject({
  ...paginationShape,
  type: categoryTypeSchema.optional(),
  search: nameSchema.optional(),
  sortBy: z.enum(['name', 'createdAt']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type CreateCategory = z.infer<typeof createCategorySchema>;
export type PatchCategory = z.infer<typeof patchCategorySchema>;
export type CategoriesQuery = z.infer<typeof categoriesQuerySchema>;
