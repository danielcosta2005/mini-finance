import { z } from 'zod';

export const centsSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
export const positiveCentsSchema = centsSchema.positive();

// PostgreSQL SUM(bigint) is numeric: parse its integer string as BigInt first.
export function toJsonCents(value: bigint | number) {
  return centsSchema.parse(typeof value === 'bigint' ? Number(value) : value);
}
