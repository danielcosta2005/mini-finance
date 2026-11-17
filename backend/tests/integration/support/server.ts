import { serve } from '@hono/node-server';
import { createApp } from '../../../src/app.js';
import { parseApiConfig } from '../../../src/config/api.js';
import { parseEnvironment } from '../../../src/config/env.js';
import { createDatabase } from '../../../src/db/client.js';

// This entrypoint is compiled only into the integration image, never the production image.
const env = parseEnvironment();
if (
  env.NODE_ENV !== 'test' ||
  new URL(env.DATABASE_URL).pathname !== '/minifinance_test'
)
  throw new Error('Integration server requires the isolated test environment');
const now = process.env.TEST_CLOCK_NOW;
if (!now || !Number.isFinite(new Date(now).getTime()))
  throw new Error('TEST_CLOCK_NOW must be an ISO timestamp');
const { db, pool } = createDatabase(env.DATABASE_URL);
const app = createApp({
  db,
  // Exercise production cookie/origin policy over the isolated HTTP transport.
  // Clients explicitly send cookies; no claim of TLS/browser validation is made here.
  config: parseApiConfig(process.env, true),
  clock: { now: () => new Date(now) },
  // A fixed financial clock must not exhaust the shared peer's throttle across independent scenarios.
  // Default production policy (20/minute) is tested separately with an injected clock.
  authRatePolicy: { maxAttempts: 10000, windowMs: 60000 },
});
const server = serve(
  { fetch: app.fetch, hostname: env.HOST, port: env.PORT },
  () => console.info('Integration API ready'),
);
function stop() {
  server.close(() => {
    void pool.end();
  });
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
