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
