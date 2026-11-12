import type { Context, Hono } from 'hono';
import type { User } from '../db/schema/types.js';
import { ApiError, businessRule, toApiError } from './api-error.js';
import { toJsonCents } from './money.js';

export type AuthUser = Pick<
  User,
  'id' | 'name' | 'email' | 'createdAt' | 'updatedAt'
>;
export type AuthContext = { user: AuthUser; sessionId: string };
export type ApiEnv = { Variables: { auth: AuthContext; requestId: string } };

export function installErrors(app: Hono<ApiEnv>) {
  app.onError((error, c) => {
    const safe = toApiError(error);
    if (safe.status === 500)
      console.error('API request failed', c.get('requestId'));
    return c.json(
      {
        error: {
          code: safe.code,
          message: safe.message,
          ...(safe.details ? { details: safe.details } : {}),
        },
        requestId: c.get('requestId'),
      },
      safe.status,
    );
  });
  app.notFound((c) =>
    c.json(
      {
        error: { code: 'NOT_FOUND', message: 'Recurso não encontrado' },
        requestId: c.get('requestId'),
      },
      404,
    ),
  );
}

export function currentUserId(c: Context<ApiEnv>) {
  const auth = c.get('auth');
  if (!auth)
    throw new ApiError(401, 'UNAUTHENTICATED', 'Autenticação necessária');
  return auth.user.id;
}

export function safeCents(value: bigint | number | string) {
  try {
    return toJsonCents(typeof value === 'string' ? BigInt(value) : value);
  } catch {
    throw businessRule('Valor monetário excede o intervalo suportado');
  }
}

export function percentage(
  part: bigint | number | string,
  whole: bigint | number | string,
) {
  const denominator = BigInt(whole);
  if (denominator <= 0n) return '0.00';
  const basisPoints = (BigInt(part) * 10000n) / denominator;
  return `${basisPoints / 100n}.${String(basisPoints % 100n).padStart(2, '0')}`;
}

export function paginated<T>(
  data: T[],
  total: number,
  query: { page: number; pageSize: number },
) {
  return {
    data,
    pagination: {
      ...query,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}
