import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDate, formatPercent, parseMoney, signedCurrency } from './format';

describe('financial formatting', () => {
  it('formats cents in BRL with a typographic negative sign', () => {
    expect(formatCurrency(123456)).toBe('R$ 1.234,56');
    expect(formatCurrency(-123456)).toBe('−R$ 1.234,56');
  });

  it('formats percentages with decimal comma', () => {
    expect(formatPercent('12.50')).toBe('12,5%');
  });

  it('parses money without floating point multiplication', () => {
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('0,01')).toBe(1);
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('999999999999999,99')).toBeNull();
    expect(parseMoney('-2,50')).toBe(-250);
  });

  it('formats dates and signed movements', () => {
    expect(formatDate('2026-11-26')).toBe('26/11/2026');
    expect(signedCurrency(2500, 'income')).toMatch(/^\+R\$/);
    expect(signedCurrency(2500, 'expense')).toMatch(/^−R\$/);
  });
});
