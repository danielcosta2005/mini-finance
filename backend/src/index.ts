import { createApp } from './app.js';
import { parseApiConfig } from './config/api.js';
import { parseEnvironment } from './config/env.js';
import { createDatabase } from './db/client.js';

// Vercel invokes this Hono app directly; the Node server remains in server.ts.
const env = parseEnvironment();
const { db } = createDatabase(env.DATABASE_URL);
const app = createApp({ db, config: parseApiConfig() });

export default app;
