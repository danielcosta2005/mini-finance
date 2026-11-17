import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ApiClient,
  database,
  registerClient,
  TEST_NOW,
} from '../support/client.js';
import { error, type Item } from './fixtures.js';

describe('HTTP público e autenticação persistida', () => {
  it('responde nos dois endpoints públicos de saúde', async () => {
    const client = new ApiClient();
    for (const path of ['/health', '/api/health']) {
      const result = await client.request('GET', path);
      expect(result.body).toEqual({ status: 'ok' });
    }
  });

  it('registra usuário público sem expor material de autenticação', async () => {
    const { client, user } = await registerClient();
    const me = await client.data<Record<string, unknown>>(
      'GET',
      '/api/auth/me',
    );
    expect(Object.keys(me).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'updatedAt',
    ]);
    expect(me.id).toBe(user.id);
    const result = await database().query<{
      password_is_hash: boolean;
      only_hashed_session: boolean;
    }>(
      `SELECT password_hash LIKE '$argon2id$%' AS password_is_hash,
       EXISTS (SELECT 1 FROM sessions WHERE user_id = users.id AND token_hash ~ '^[0-9a-f]{64}$') AS only_hashed_session
       FROM users WHERE id = $1`,
      [user.id],
    );
    expect(result.rows[0]).toEqual({
      password_is_hash: true,
      only_hashed_session: true,
    });
  });

  it('faz login com email normalizado e define cookie de produção seguro', async () => {
    const { client, user, email, password } = await registerClient();
    const result = await client.request<Item>('POST', '/api/auth/login', {
      email: `  ${email.toUpperCase()}  `,
      password,
    });
    expect(result.body.data.id).toBe(user.id);
    const header = result.response.headers.get('set-cookie') ?? '';
    // Boolean assertions never print session contents if an attribute is missing.
    expect(header.startsWith('__Host-minifinance_session=')).toBe(true);
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'])
      expect(header.includes(attribute)).toBe(true);
    expect(/;\s*Domain=/i.test(header)).toBe(false);
    expect(Object.keys(result.body.data).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'updatedAt',
    ]);
  });

  it('recusa email duplicado e senha inválida sem mudar a sessão existente', async () => {
    const { client, email, password } = await registerClient();
    await error(
      client,
      'POST',
      '/api/auth/register',
      { name: 'Outra pessoa exemplo', email: email.toUpperCase(), password },
      409,
      'CONFLICT',
    );
    await error(
      client,
      'POST',
      '/api/auth/login',
      { email, password: randomUUID() },
      401,
      'INVALID_CREDENTIALS',
    );
    await client.request('GET', '/api/auth/me');
  });

  it('logout revoga a sessão no banco e recusa a reutilização do cookie', async () => {
    const { client, user } = await registerClient();
    const cookie = client.cookie;
    expect(await client.data('POST', '/api/auth/logout', {})).toEqual({
      loggedOut: true,
    });
    await client.request('GET', '/api/auth/me', undefined, 401, { cookie });
    const result = await database().query<{ revoked: boolean }>(
      'SELECT revoked_at IS NOT NULL AS revoked FROM sessions WHERE user_id = $1',
      [user.id],
    );
    expect(result.rows).toEqual([{ revoked: true }]);
  });

  it('recusa sessão expirada persistida', async () => {
    const { client, user } = await registerClient();
    await database().query(
      `UPDATE sessions SET created_at = $2::timestamptz - interval '2 days', expires_at = $2::timestamptz - interval '1 day' WHERE user_id = $1`,
      [user.id, TEST_NOW],
    );
    await error(
      client,
      'GET',
      '/api/auth/me',
      undefined,
      401,
      'UNAUTHENTICATED',
    );
  });

  it('recusa sessão revogada e cookie malformado', async () => {
    const { client, user } = await registerClient();
    await database().query(
      'UPDATE sessions SET revoked_at = $2 WHERE user_id = $1',
      [user.id, TEST_NOW],
    );
    await error(
      client,
      'GET',
      '/api/accounts',
      undefined,
      401,
      'UNAUTHENTICATED',
    );
    await client.request('GET', '/api/auth/me', undefined, 401, {
      cookie: '__Host-minifinance_session=invalid',
    });
    await new ApiClient().request('GET', '/api/accounts', undefined, 401);
  });

  it('exige Origin autorizado nas mutações autenticadas', async () => {
    const { client } = await registerClient();
    const body = { name: 'Conta exemplo', type: 'checking' };
    for (const origin of [null, 'https://untrusted.example.test']) {
      const result = await client.request('POST', '/api/accounts', body, 403, {
        origin,
      });
      expect(result.body.error?.code).toBe('FORBIDDEN_ORIGIN');
    }
    expect((await client.list('/api/accounts')).pagination.total).toBe(0);
  });

  it('rejeita tipo de conteúdo não JSON e corpo acima do limite', async () => {
    const { client } = await registerClient();
    await client.request(
      'POST',
      '/api/accounts',
      { name: 'Conta exemplo', type: 'cash' },
      400,
      { headers: { 'Content-Type': 'text/plain' } },
    );
    await error(
      client,
      'POST',
      '/api/accounts',
      { name: 'x'.repeat(33000), type: 'cash' },
      413,
      'PAYLOAD_TOO_LARGE',
    );
  });
});
