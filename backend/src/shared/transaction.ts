import type { Database, DbExecutor } from '../db/types.js';
import { databaseErrorCode } from './api-error.js';

export async function withTransaction<T>(
  db: Database,
  work: (tx: DbExecutor) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction((tx) => work(tx));
    } catch (error) {
      if (
        attempt >= 2 ||
        !['40001', '40P01'].includes(databaseErrorCode(error) ?? '')
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }
}
