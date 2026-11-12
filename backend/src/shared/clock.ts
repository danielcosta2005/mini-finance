export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };

export function today(clock: Clock, timeZone = 'America/Sao_Paulo') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(clock.now());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function shiftMonth(month: string, offset: number) {
  const index =
    Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + offset;
  const year = Math.floor(index / 12);
  if (year < 1 || year > 10000)
    throw new RangeError('Mês fora do intervalo suportado');
  return `${String(year).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}
export function monthRange(month: string) {
  return { start: `${month}-01`, endExclusive: `${shiftMonth(month, 1)}-01` };
}
