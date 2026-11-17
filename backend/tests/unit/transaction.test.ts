import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as schema from '../../src/db/schema/index.js';
import type { Database, DbExecutor } from '../../src/db/types.js';
import { withTransaction } from '../../src/shared/transaction.js';

type TransactionScope = Parameters<Parameters<Database['transaction']>[0]>[0];
function setup() {
  const db = drizzle({
    client: new Pool({ host: 'database.example.invalid', database: 'fixture' }),
    schema,
  });
  // The callback only needs the executor interface; no SQL is executed here.
  const tx = drizzle.mock({ schema }) as unknown as TransactionScope;
  const transaction = vi.spyOn(db, 'transaction');
  transaction.mockImplementation(async (work) => work(tx));
  const work = vi
    .fn<(scope: DbExecutor) => Promise<string>>()
    .mockResolvedValue('result-example');
  return { db, tx, transaction, work };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('transaction retry boundary', () => {
  it('returns the callback result and supplies the transaction executor', async () => {
    const { db, tx, transaction, work } = setup();
    expect(await withTransaction(db, work)).toBe('result-example');
    expect(transaction).toHaveBeenCalledOnce();
    expect(work).toHaveBeenCalledExactlyOnceWith(tx);
  });
  it.each(['40001', '40P01'])(
    'retries a transient %s error and returns the successful result',
    async (code) => {
      vi.useFakeTimers();
      const { db, transaction, work } = setup();
      transaction.mockRejectedValueOnce({ code });
      const pending = withTransaction(db, work);
      const assertion = expect(pending).resolves.toBe('result-example');
      await vi.runAllTimersAsync();
      await assertion;
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(work).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it('retries nested driver causes and both backoff intervals before succeeding', async () => {
    vi.useFakeTimers();
    const { db, transaction, work } = setup();
    transaction
      .mockRejectedValueOnce({ cause: { code: '40001' } })
      .mockRejectedValueOnce({ code: '40P01' });
    const pending = withTransaction(db, work);
    const assertion = expect(pending).resolves.toBe('result-example');
    await vi.advanceTimersByTimeAsync(9);
    expect(transaction).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(transaction).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(19);
    expect(transaction).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(transaction).toHaveBeenCalledTimes(3);
  });
  it.each(['40001', '40P01'])(
    'stops after three failed attempts for %s',
    async (code) => {
      vi.useFakeTimers();
      const { db, transaction, work } = setup();
      const failure = { code, message: 'fixture transaction conflict' };
      transaction.mockRejectedValue(failure);
      const assertion = expect(withTransaction(db, work)).rejects.toBe(failure);
      await vi.runAllTimersAsync();
      await assertion;
      expect(transaction).toHaveBeenCalledTimes(3);
      expect(work).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it.each([
    { code: '23505' },
    { code: '23514' },
    new Error('fixture failure'),
    null,
    'fixture failure',
  ])('does not retry a nontransient failure case %#', async (failure) => {
    vi.useFakeTimers();
    const { db, transaction, work } = setup();
    transaction.mockRejectedValue(failure);
    await expect(withTransaction(db, work)).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates callback failures through the transaction boundary', async () => {
    const { db, transaction, work } = setup();
    const failure = new Error('fixture work rejected');
    work.mockRejectedValue(failure);
    await expect(withTransaction(db, work)).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledOnce();
    expect(work).toHaveBeenCalledOnce();
  });
});
