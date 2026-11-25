import { HttpResponse, http } from 'msw/http';
import { describe, expect, it } from 'vitest';
import { server } from '../../tests/mocks/server';
import { type ApiError, api } from './api';

describe('API client', () => {
  it('sends cookies and JSON to the real API path', async () => {
    server.use(
      http.post('http://localhost:5173/api/accounts', async ({ request }) => {
        expect(await request.json()).toEqual({ name: 'Conta', type: 'cash' });
        return HttpResponse.json({ data: { id: 'a' } }, { status: 201 });
      }),
    );
    expect(
      await api<{ id: string }>('/accounts', {
        method: 'POST',
        body: { name: 'Conta', type: 'cash' },
      }),
    ).toEqual({ id: 'a' });
  });

  it('preserves the API error message', async () => {
    server.use(
      http.get('http://localhost:5173/api/accounts', () =>
        HttpResponse.json(
          { error: { code: 'UNAUTHENTICATED', message: 'Sessão expirada' } },
          { status: 401 },
        ),
      ),
    );
    await expect(api('/accounts')).rejects.toMatchObject({
      status: 401,
      message: 'Sessão expirada',
    } satisfies Partial<ApiError>);
  });
});
