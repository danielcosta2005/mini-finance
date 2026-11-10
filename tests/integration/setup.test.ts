import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/client.js';

function testDatabaseUrl() {
  const value = process.env.INTEGRATION_DATABASE_URL;
  if (!value || new URL(value).pathname !== '/minifinance_test') {
    throw new Error('INTEGRATION_DATABASE_URL must target minifinance_test');
  }
  return value;
}

describe('integration infrastructure smoke tests', () => {
  it('serves health over HTTP from the running API', async () => {
    const baseUrl = process.env.INTEGRATION_API_URL;
    if (!baseUrl) throw new Error('INTEGRATION_API_URL is required');

    const response = await fetch(new URL('/health', baseUrl), {
      signal: AbortSignal.timeout(5_000),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('queries the isolated PostgreSQL database using Drizzle', async () => {
    const { db, pool } = createDatabase(testDatabaseUrl());
    try {
      const result = await db.execute(sql`select current_database() as name`);
      expect(result.rows).toEqual([{ name: 'minifinance_test' }]);
    } finally {
      await pool.end();
    }
  });
});
