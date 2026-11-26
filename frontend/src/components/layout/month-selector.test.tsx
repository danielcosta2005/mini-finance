import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LogoMark } from './logo-mark';
import { MonthSelector } from './month-selector';

describe('MonthSelector', () => {
  it('shows the named month and announces navigation controls', () => {
    render(<MonthSelector value="2026-11" onChange={vi.fn()} />);

    expect(screen.getByText('novembro de 2026')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mês anterior' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toBeVisible();
  });

  it('changes the selected month by one month in either direction', () => {
    const onChange = vi.fn();
    render(<MonthSelector value="2026-12" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(onChange).toHaveBeenLastCalledWith('2026-11');
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(onChange).toHaveBeenLastCalledWith('2027-01');
  });

  it('renders the brand mark with its required geometry and current color', () => {
    const { container } = render(<LogoMark className="brand-mark" size={20} />);
    const mark = container.querySelector('svg');

    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveAttribute('width', '20');
    expect(mark).toHaveClass('brand-mark');
    expect(mark?.querySelector('path')).toHaveAttribute(
      'd',
      'M7 30V10l13 14 13-14v20',
    );
    expect(mark?.querySelector('path')).toHaveAttribute(
      'stroke',
      'currentColor',
    );
  });
});
