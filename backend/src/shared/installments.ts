import { z } from 'zod';
import { positiveCentsSchema, toJsonCents } from './money.js';

export function getInstallmentCents(
  total: number,
  count: number,
  number: number,
) {
  positiveCentsSchema.parse(total);
  z.number().int().min(1).max(Math.min(total, 2_147_483_647)).parse(count);
  z.number().int().min(1).max(count).parse(number);
  const amount = BigInt(total);
  const installments = BigInt(count);
  return toJsonCents(
    amount / installments + (BigInt(number) <= amount % installments ? 1n : 0n),
  );
}
