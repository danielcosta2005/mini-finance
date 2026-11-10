import { z } from 'zod';

const healthSchema = z.object({ status: z.literal('ok') });

export async function getHealth(signal: AbortSignal) {
  const response = await fetch('/api/health', {
    signal,
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error('A API está indisponível');
  return healthSchema.parse(await response.json());
}
