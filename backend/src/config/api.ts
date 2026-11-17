import { z } from 'zod';

const schema = z.object({
  APP_ORIGINS: z.string().optional(),
  SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(300)
    .max(2592000)
    .default(604800),
  APP_TIME_ZONE: z.string().default('America/Sao_Paulo'),
});
export function parseApiConfig(
  input: NodeJS.ProcessEnv = process.env,
  production = input.NODE_ENV === 'production',
) {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error('Invalid API environment configuration');
  const configured = result.data.APP_ORIGINS;
  if (production && !configured)
    throw new Error('APP_ORIGINS is required in production');
  const origins = (configured ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((value) => value.trim());
  if (
    !origins.length ||
    origins.some((value) => {
      try {
        const url = new URL(value);
        return (
          url.origin !== value ||
          url.hostname.includes('*') ||
          !['http:', 'https:'].includes(url.protocol) ||
          (production && url.protocol !== 'https:')
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error('Invalid APP_ORIGINS configuration');
  try {
    new Intl.DateTimeFormat('en', {
      timeZone: result.data.APP_TIME_ZONE,
    }).format();
  } catch {
    throw new Error('Invalid APP_TIME_ZONE configuration');
  }
  return {
    origins,
    production,
    sessionTtlSeconds: result.data.SESSION_TTL_SECONDS,
    timeZone: result.data.APP_TIME_ZONE,
    cookieName: production
      ? '__Host-minifinance_session'
      : 'minifinance_session',
  };
}
export type ApiConfig = ReturnType<typeof parseApiConfig>;
