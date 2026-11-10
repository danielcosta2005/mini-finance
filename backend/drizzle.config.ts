import { defineConfig } from 'drizzle-kit';
import { parseEnvironment } from './src/config/env.js';

const env = parseEnvironment();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: env.DATABASE_URL },
  strict: true,
});
