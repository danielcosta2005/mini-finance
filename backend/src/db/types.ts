import type { createDatabase } from './client.js';

export type Database = ReturnType<typeof createDatabase>['db'];
export type DbExecutor = Pick<
  Database,
  'select' | 'insert' | 'update' | 'delete' | 'execute'
>;
