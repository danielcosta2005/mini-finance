export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | undefined>;
};

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value !== undefined && value !== '')
      url.searchParams.set(key, String(value));
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      credentials: 'include',
      ...(options.body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(options.body),
          }),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar à API.');
  }
  const payload = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok) {
    if (response.status === 401 && payload?.error?.code === 'UNAUTHENTICATED')
      window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'HTTP_ERROR',
      payload?.error?.message ?? 'Não foi possível concluir a operação.',
    );
  }
  return payload?.data as T;
}

export type Page<T> = {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
export async function list<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<Page<T>> {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== '')
      url.searchParams.set(key, String(value));
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'include' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar à API.');
  }
  const payload = (await response.json().catch(() => null)) as
    | (Page<T> & { error?: { code: string; message: string } })
    | null;
  if (!response.ok) {
    if (response.status === 401 && payload?.error?.code === 'UNAUTHENTICATED')
      window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(
      response.status,
      payload?.error?.code ?? 'HTTP_ERROR',
      payload?.error?.message ?? 'Não foi possível carregar os dados.',
    );
  }
  return payload as Page<T>;
}
