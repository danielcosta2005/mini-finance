import { serve } from '@hono/node-server';
import { app } from './app.js';
import { parseEnvironment } from './config/env.js';
import { createDatabase } from './db/client.js';

const env = parseEnvironment();
const { pool } = createDatabase(env.DATABASE_URL);
const server = serve(
  { fetch: app.fetch, hostname: env.HOST, port: env.PORT },
  () => {
    console.info('MiniFinance API started');
  },
);

server.on('error', async () => {
  console.error('Unable to start the HTTP server');
  process.exitCode = 1;
  await pool.end();
});

function shutdown() {
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  server.close(async (error) => {
    try {
      await pool.end();
      process.exitCode = error ? 1 : 0;
    } catch {
      console.error('Unable to close PostgreSQL connections');
      process.exitCode = 1;
    } finally {
      clearTimeout(timeout);
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
