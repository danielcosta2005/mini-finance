const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function formatCurrency(cents: number): string {
  const value = brl.format(Math.abs(cents) / 100);
  return cents < 0 ? `−${value}` : value;
}

export function signedCurrency(
  cents: number,
  type: 'income' | 'expense',
): string {
  return `${type === 'income' ? '+' : '−'}${formatCurrency(Math.abs(cents))}`;
}

export function formatPercent(value: string | number): string {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Number(value))}%`;
}

export function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year}` : value;
}

export function parseMoney(input: string): number | null {
  const normalized = input
    .trim()
    .replace(/^R\$\s*/, '')
    .replace(/\./g, '');
  if (!/^-?\d+(,\d{1,2})?$/.test(normalized)) return null;
  const negative = normalized.startsWith('-');
  const [whole, fraction = ''] = normalized.replace('-', '').split(',');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

export const currentMonth = () =>
  new Date()
    .toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    .slice(0, 7);
export const currentDate = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export function formatMonth(value: string): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) throw new RangeError(`Invalid month: ${value}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function shiftMonth(value: string, amount: number): string {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match || !Number.isInteger(amount))
    throw new RangeError(`Invalid month shift: ${value}`);
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1 + amount, 1),
  );
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatAxisMonth(
  value: string,
  index: number,
  previous?: string,
): string {
  const month = formatMonth(value);
  const monthName = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    timeZone: 'UTC',
  })
    .format(
      new Date(
        Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, 1),
      ),
    )
    .replace(/\.$/, '');
  const yearChanged = previous && previous.slice(0, 4) !== value.slice(0, 4);
  return index === 0 || yearChanged
    ? `${monthName} ${month.split(' de ')[1]}`
    : monthName;
}
