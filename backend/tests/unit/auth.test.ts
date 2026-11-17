import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { AuthRepository } from '../../src/modules/auth/repositories.js';
import {
  emptyBodySchema,
  loginSchema,
  registerSchema,
} from '../../src/modules/auth/schemas.js';
import {
  createAuthService,
  type PasswordHasher,
} from '../../src/modules/auth/services.js';
import type { AuthUser } from '../../src/shared/http.js';

const now = new Date('2026-01-15T12:00:00Z');
const user: AuthUser = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Pessoa Exemplo',
  email: 'person@example.com',
  createdAt: now,
  updatedAt: now,
};
const input = {
  name: user.name,
  email: user.email,
  password: 'fictitious-password',
};
function setup() {
  const repository = {
    findByEmail: vi
      .fn<AuthRepository['findByEmail']>()
      .mockResolvedValue({ ...user, passwordHash: 'fixture-hash' }),
    register: vi.fn<AuthRepository['register']>().mockResolvedValue(user),
    addSession: vi
      .fn<AuthRepository['addSession']>()
      .mockResolvedValue(undefined),
    authenticate: vi
      .fn<AuthRepository['authenticate']>()
      .mockResolvedValue({ user, sessionId: 'session-example' }),
    revoke: vi.fn<AuthRepository['revoke']>().mockResolvedValue(undefined),
  } satisfies AuthRepository;
  const hasher = {
    hash: vi.fn<PasswordHasher['hash']>().mockResolvedValue('fixture-hash'),
    verify: vi.fn<PasswordHasher['verify']>().mockResolvedValue(true),
  } satisfies PasswordHasher;
  const service = createAuthService(
    repository,
    { now: () => now },
    3600,
    hasher,
  );
  return { service, repository, hasher };
}

describe('authentication service', () => {
  it('registers the public user and passes only the encoded password to persistence', async () => {
    const { service, repository, hasher } = setup();
    const result = await service.register(input);
    expect(result.user).toEqual(user);
    expect(hasher.hash).toHaveBeenCalledWith(input.password);
    expect(repository.register).toHaveBeenCalledWith(
      { name: input.name, email: input.email, passwordHash: 'fixture-hash' },
      expect.objectContaining({
        createdAt: now,
        expiresAt: new Date('2026-01-15T13:00:00Z'),
      }),
    );
    expect(
      repository.register.mock.calls[0]?.[1].tokenHash ===
        createHash('sha256').update(result.token).digest('hex'),
    ).toBe(true);
  });
  it('generates independent sessions on separate registrations', async () => {
    const { service } = setup();
    const first = await service.register(input);
    const second = await service.register(input);
    expect(first.token === second.token).toBe(false);
    expect(/^[A-Za-z0-9_-]{43}$/.test(first.token)).toBe(true);
  });
  it('logs in and returns only public user fields', async () => {
    const { service, repository, hasher } = setup();
    const result = await service.login({
      email: input.email,
      password: input.password,
    });
    expect(result.user).toEqual(user);
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(repository.findByEmail).toHaveBeenCalledWith(input.email);
    expect(hasher.verify).toHaveBeenCalledWith('fixture-hash', input.password);
    expect(repository.addSession).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({
        createdAt: now,
        expiresAt: new Date('2026-01-15T13:00:00Z'),
      }),
    );
    expect(
      repository.addSession.mock.calls[0]?.[1].tokenHash ===
        createHash('sha256').update(result.token).digest('hex'),
    ).toBe(true);
  });
  it('rejects an incorrect password without adding a session', async () => {
    const { service, repository, hasher } = setup();
    hasher.verify.mockResolvedValue(false);
    await expect(service.login(input)).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(repository.addSession).not.toHaveBeenCalled();
  });
  it('verifies the dummy hash for an unknown email and returns the same 401', async () => {
    const { service, repository, hasher } = setup();
    repository.findByEmail.mockResolvedValue(undefined);
    await expect(service.login(input)).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(hasher.verify).toHaveBeenCalledWith('fixture-hash', input.password);
    expect(repository.addSession).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    '',
    'short',
    'a'.repeat(42),
    'a'.repeat(44),
    '!'.repeat(43),
  ])(
    'ignores malformed bearer value case %# without querying persistence',
    async (token) => {
      const { service, repository } = setup();
      expect(await service.authenticate(token)).toBeUndefined();
      expect(repository.authenticate).not.toHaveBeenCalled();
    },
  );
  it('hashes a syntactically valid token and delegates expiry/revocation lookup', async () => {
    const { service, repository } = setup();
    const token = 'a'.repeat(43);
    expect(await service.authenticate(token)).toEqual({
      user,
      sessionId: 'session-example',
    });
    expect(repository.authenticate).toHaveBeenCalledWith(
      createHash('sha256').update(token).digest('hex'),
      now,
    );
  });
  it('returns undefined when persistence finds no active session', async () => {
    const { service, repository } = setup();
    repository.authenticate.mockResolvedValue(undefined);
    expect(await service.authenticate('a'.repeat(43))).toBeUndefined();
  });
  it('revokes precisely the authenticated user session at the injected time', async () => {
    const { service, repository } = setup();
    await service.logout(user.id, 'session-example');
    expect(repository.revoke).toHaveBeenCalledWith(
      user.id,
      'session-example',
      now,
    );
  });
  it('propagates registration persistence errors', async () => {
    const { service, repository } = setup();
    const failure = new Error('fixture persistence failure');
    repository.register.mockRejectedValue(failure);
    await expect(service.register(input)).rejects.toBe(failure);
  });
});

describe('authentication schemas', () => {
  it('normalizes name and email while preserving the password bytes', () => {
    expect(
      registerSchema.parse({
        ...input,
        name: '  Pessoa Exemplo  ',
        email: ' PERSON@EXAMPLE.COM ',
        password: '  fictitious-value  ',
      }),
    ).toEqual({ ...input, password: '  fictitious-value  ' });
    expect(
      loginSchema.parse({
        email: ' PERSON@EXAMPLE.COM ',
        password: input.password,
      }).email,
    ).toBe(user.email);
  });
  it.each([
    { ...input, password: 'short' },
    { ...input, password: 'x'.repeat(129) },
    { ...input, email: 'invalid' },
    { ...input, name: ' ' },
    { ...input, extra: true },
  ])('rejects invalid registration case %#', (value) => {
    expect(registerSchema.safeParse(value).success).toBe(false);
  });
  it('accepts an empty logout body and rejects extra properties', () => {
    expect(emptyBodySchema.parse({})).toEqual({});
    expect(
      emptyBodySchema.safeParse({ sessionId: 'not-accepted' }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ email: user.email, password: 'short' }).success,
    ).toBe(false);
  });
});
