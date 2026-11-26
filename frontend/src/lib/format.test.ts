import { describe, expect, it } from 'vitest';
import {
  formatAxisMonth,
  formatCurrency,
  formatDate,
  formatMonth,
  formatPercent,
  parseMoney,
  shiftMonth,
  signedCurrency,
} from './format';

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

  it('formats a month in Portuguese without an ISO date', () => {
    expect(formatMonth('2026-11')).toBe('novembro de 2026');
  });

  it('moves between months across year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
    expect(shiftMonth('2024-03', -1)).toBe('2024-02');
  });

  it('labels the first month and year transitions on a cash-flow axis', () => {
    expect(formatAxisMonth('2025-12', 0)).toBe('dez 2025');
    expect(formatAxisMonth('2026-01', 1, '2025-12')).toBe('jan 2026');
    expect(formatAxisMonth('2026-02', 2, '2026-01')).toBe('fev');
  });
});
