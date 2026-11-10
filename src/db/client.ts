import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

// Creation is explicit; importing this module neither connects nor opens a port.
export function createDatabase(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });

  pool.on('error', () => {
    console.error('Unexpected idle PostgreSQL connection error');
  });

  return { db: drizzle(pool, { schema }), pool };
}
