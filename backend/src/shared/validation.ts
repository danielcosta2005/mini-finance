import type { Context } from 'hono';
import { z } from 'zod';
import { ApiError } from './api-error.js';

export const idParamsSchema = z.strictObject({ id: z.uuid() });
export const financialDateSchema = z.iso
  .date()
  .refine((value) => value >= '0001-01-01', 'Data inválida');
export const monthSchema = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/);
export const nameSchema = z.string().trim().min(1).max(120);
export const descriptionSchema = z.string().trim().min(1).max(500);
export const paginationShape = {
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
export const dateRangeShape = {
  from: financialDateSchema.optional(),
  to: financialDateSchema.optional(),
};
export const listQuerySchema = z.strictObject(paginationShape);
export function hasPatch(value: object) {
  return Object.values(value).some((item) => item !== undefined);
}
export function validDateRange(value: {
  from?: string | undefined;
  to?: string | undefined;
}) {
  return !value.from || !value.to || value.from <= value.to;
}

export function validate<S extends z.ZodType>(
  schema: S,
  value: unknown,
): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Dados de entrada inválidos',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: 'Informe um valor válido',
      })),
    );
  return result.data;
}

export async function readBody<S extends z.ZodType>(
  c: Context,
  schema: S,
  allowEmpty = false,
): Promise<z.output<S>> {
  const text = await c.req.text();
  if (allowEmpty && text.length === 0) return validate(schema, {});
  if (!/^application\/json(?:;|$)/i.test(c.req.header('content-type') ?? ''))
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Envie o corpo como application/json',
    );
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'JSON inválido');
  }
  return validate(schema, value);
}
export function readQuery<S extends z.ZodType>(
  c: Context,
  schema: S,
): z.output<S> {
  if (Object.values(c.req.queries()).some((values) => values.length > 1))
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Parâmetro de consulta repetido',
    );
  return validate(schema, c.req.query());
}
export function readParams<S extends z.ZodType>(
  c: Context,
  schema: S,
): z.output<S> {
  return validate(schema, c.req.param());
}
