import { z } from 'zod';

function clampedDate(year: number, month: number, day: number) {
  const last = new Date('2000-01-01T00:00:00Z');
  last.setUTCFullYear(year, month + 1, 0);
  const date = new Date('2000-01-01T00:00:00Z');
  date.setUTCFullYear(year, month, Math.min(day, last.getUTCDate()));
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999)
    throw new RangeError('Financial year out of range');
  return date;
}

// Choose the due month before clamping, keeping one consecutive invoice per month.
export function getInvoiceDates(
  date: string,
  closingDay: number,
  dueDay: number,
  offset = 0,
) {
  z.iso.date().parse(date);
  const day = z.number().int().min(1).max(31);
  day.parse(closingDay);
  day.parse(dueDay);
  z.number().int().min(0).max(2_147_483_647).parse(offset);
  const purchase = new Date(`${date}T00:00:00Z`);
  const year = purchase.getUTCFullYear();
  let month = purchase.getUTCMonth();
  if (purchase > clampedDate(year, month, closingDay)) month += 1;
  const closing = clampedDate(year, month + offset, closingDay);
  const due = clampedDate(
    closing.getUTCFullYear(),
    closing.getUTCMonth() + (dueDay <= closingDay ? 1 : 0),
    dueDay,
  );
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  return {
    period: iso(clampedDate(due.getUTCFullYear(), due.getUTCMonth(), 1)),
    closesOn: iso(closing),
    dueOn: iso(due),
  };
}
