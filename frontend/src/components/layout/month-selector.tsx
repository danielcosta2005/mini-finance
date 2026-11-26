import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatMonth, shiftMonth } from '@/lib/format';

export function MonthSelector({
  value,
  onChange,
  label = 'Mês de referência',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <fieldset className="period-control">
      <legend className="visually-hidden">{label}</legend>
      <button
        type="button"
        className="icon-button"
        aria-label="Mês anterior"
        onClick={() => onChange(shiftMonth(value, -1))}
      >
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <span className="month-label" aria-live="polite">
        {formatMonth(value)}
      </span>
      <button
        type="button"
        className="icon-button"
        aria-label="Próximo mês"
        onClick={() => onChange(shiftMonth(value, 1))}
      >
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </fieldset>
  );
}
