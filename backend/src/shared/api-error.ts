export type ApiErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 409
  | 413
  | 422
  | 429
  | 500;

export class ApiError extends Error {
  constructor(
    public readonly status: ApiErrorStatus,
    public readonly code: string,
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function notFound(message = 'Recurso não encontrado') {
  return new ApiError(404, 'NOT_FOUND', message);
}

export function businessRule(message: string) {
  return new ApiError(422, 'BUSINESS_RULE', message);
}

export function databaseErrorCode(error: unknown): string | undefined {
  let current = error;
  for (
    let depth = 0;
    depth < 6 && typeof current === 'object' && current !== null;
    depth++
  ) {
    if ('code' in current && typeof current.code === 'string')
      return current.code;
    current = 'cause' in current ? current.cause : undefined;
  }
  return undefined;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  switch (databaseErrorCode(error)) {
    case '23505':
      return new ApiError(
        409,
        'CONFLICT',
        'Registro já existente ou operação já realizada',
      );
    case '23503':
      return new ApiError(
        409,
        'CONFLICT',
        'Recurso associado inexistente ou ainda em uso',
      );
    case '23514':
      return businessRule('A operação viola uma regra financeira');
    case '40001':
    case '40P01':
      return new ApiError(
        409,
        'CONCURRENT_UPDATE',
        'Conflito de atualização; tente novamente',
      );
    default:
      return new ApiError(
        500,
        'INTERNAL_ERROR',
        'Não foi possível concluir a operação',
      );
  }
}
