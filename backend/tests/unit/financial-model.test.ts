import { describe, expect, it } from 'vitest';
import { getInvoiceDates } from '../../src/shared/billing.js';
import { getInstallmentCents } from '../../src/shared/installments.js';
import {
  centsSchema,
  positiveCentsSchema,
  toJsonCents,
} from '../../src/shared/money.js';

describe('safe integer cents', () => {
  it('serializes safe bigint without rounding and supports signed balances', () => {
    expect(toJsonCents(9_007_199_254_740_991n)).toBe(Number.MAX_SAFE_INTEGER);
    expect(JSON.stringify({ cents: toJsonCents(123n) })).toBe('{"cents":123}');
    expect(centsSchema.parse(-123)).toBe(-123);
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, '100'])(
    'rejects invalid positive JSON cents %j',
    (value) => {
      expect(positiveCentsSchema.safeParse(value).success).toBe(false);
    },
  );
  it('rejects bigint amounts outside the safe interval', () => {
    expect(() => toJsonCents(9_007_199_254_740_992n)).toThrow();
    expect(() => toJsonCents(-9_007_199_254_740_992n)).toThrow();
  });
});

describe('installment allocation', () => {
  it('distributes residual cents to the first installments', () => {
    expect([1, 2, 3].map((n) => getInstallmentCents(1000, 3, n))).toEqual([
      334, 333, 333,
    ]);
    expect([1, 2, 3].map((n) => getInstallmentCents(1001, 3, n))).toEqual([
      334, 334, 333,
    ]);
  });
  it('allocates the maximum safe amount exactly', () => {
    const values = [1, 2, 3].map((n) =>
      BigInt(getInstallmentCents(Number.MAX_SAFE_INTEGER, 3, n)),
    );
    expect(values.reduce((sum, value) => sum + value, 0n)).toBe(
      9_007_199_254_740_991n,
    );
  });
  it.each([
    [2, 3, 1],
    [100, 0, 1],
    [100, 2, 0],
    [100, 2, 3],
    [100, 1.5, 1],
  ])('rejects invalid allocation arguments', (total, count, number) => {
    expect(() => getInstallmentCents(total, count, number)).toThrow();
  });
});

describe('invoice calendar (closing day inclusive)', () => {
  it.each([
    [
      '2026-01-10',
      10,
      20,
      0,
      { period: '2026-01-01', closesOn: '2026-01-10', dueOn: '2026-01-20' },
    ],
    [
      '2026-01-11',
      10,
      20,
      0,
      { period: '2026-02-01', closesOn: '2026-02-10', dueOn: '2026-02-20' },
    ],
    [
      '2026-01-10',
      10,
      5,
      0,
      { period: '2026-02-01', closesOn: '2026-01-10', dueOn: '2026-02-05' },
    ],
    [
      '2026-02-28',
      31,
      10,
      0,
      { period: '2026-03-01', closesOn: '2026-02-28', dueOn: '2026-03-10' },
    ],
    [
      '2028-02-29',
      31,
      10,
      0,
      { period: '2028-03-01', closesOn: '2028-02-29', dueOn: '2028-03-10' },
    ],
    [
      '2026-02-20',
      28,
      31,
      0,
      { period: '2026-02-01', closesOn: '2026-02-28', dueOn: '2026-02-28' },
    ],
    [
      '2026-12-11',
      10,
      5,
      0,
      { period: '2027-02-01', closesOn: '2027-01-10', dueOn: '2027-02-05' },
    ],
    [
      '2026-01-10',
      10,
      20,
      1,
      { period: '2026-02-01', closesOn: '2026-02-10', dueOn: '2026-02-20' },
    ],
  ] as const)(
    'maps %s to closing and due dates',
    (date, closingDay, dueDay, offset, expected) => {
      expect(getInvoiceDates(date, closingDay, dueDay, offset)).toEqual(
        expected,
      );
    },
  );
  it('rejects impossible dates and invalid calendar settings', () => {
    expect(() => getInvoiceDates('2026-02-30', 10, 20)).toThrow();
    expect(() => getInvoiceDates('2026-01-01', 0, 20)).toThrow();
    expect(() => getInvoiceDates('2026-01-01', 10, 32)).toThrow();
    expect(() => getInvoiceDates('2026-01-01', 10, 20, -1)).toThrow();
  });
});
