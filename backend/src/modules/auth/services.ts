import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { ApiError } from '../../shared/api-error.js';
import type { Clock } from '../../shared/clock.js';
import type { AuthUser } from '../../shared/http.js';
import type { AuthRepository } from './repositories.js';
import type { LoginInput, RegisterInput } from './schemas.js';
export interface PasswordHasher {
  hash(value: string): Promise<string>;
  verify(encoded: string, value: string): Promise<boolean>;
}
export const passwordHasher: PasswordHasher = {
  hash: (value) =>
    hash(value, {
      algorithm: 2, // Argon2id; the package exposes an ambient const enum incompatible with verbatimModuleSyntax.
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
      outputLen: 32,
    }),
  verify: (encoded, value) => verify(encoded, value),
};
const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export function createAuthService(
  repository: AuthRepository,
  clock: Clock,
  ttlSeconds: number,
  hasher: PasswordHasher = passwordHasher,
) {
  // Unknown users perform password verification too; this dummy is never persisted.
  const dummyHash = hasher.hash(randomBytes(32).toString('base64url'));
  function session() {
    const token = randomBytes(32).toString('base64url');
    const createdAt = clock.now();
    return {
      token,
      stored: {
        tokenHash: tokenHash(token),
        createdAt,
        expiresAt: new Date(createdAt.getTime() + ttlSeconds * 1000),
      },
    };
  }
  return {
    async register(input: RegisterInput) {
      const passwordHash = await hasher.hash(input.password);
      const next = session();
      const user = await repository.register(
        { name: input.name, email: input.email, passwordHash },
        next.stored,
      );
      return { user, token: next.token };
    },
    async login(input: LoginInput) {
      const record = await repository.findByEmail(input.email);
      const valid = await hasher.verify(
        record?.passwordHash ?? (await dummyHash),
        input.password,
      );
      if (!record || !valid)
        throw new ApiError(
          401,
          'INVALID_CREDENTIALS',
          'E-mail ou senha inválidos',
        );
      const next = session();
      await repository.addSession(record.id, next.stored);
      const user: AuthUser = {
        id: record.id,
        name: record.name,
        email: record.email,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
      return { user, token: next.token };
    },
    async authenticate(token: string | undefined) {
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
      return repository.authenticate(tokenHash(token), clock.now());
    },
    async logout(userId: string, sessionId: string) {
      await repository.revoke(userId, sessionId, clock.now());
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
