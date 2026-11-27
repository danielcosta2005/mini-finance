import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentMonth, formatMonth, shiftMonth } from '@/lib/format';
import { server } from '../../tests/mocks/server';
import { Layout } from './layout';

function renderLayout(path = '/cartoes') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(['session'], {
    id: 'user-1',
    name: 'Ana Silva',
    email: 'ana@example.test',
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>Tela de login</div>} />
          <Route element={<Layout />}>
            <Route path="/" element={<div>Conteúdo do painel</div>} />
            <Route path="/cartoes" element={<div>Conteúdo da página</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  vi.restoreAllMocks();
});

describe('application layout', () => {
  it('shows the route title once and toggles the theme', async () => {
    renderLayout();

    expect(
      screen.getByRole('heading', { name: 'Cartões', level: 1 }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Cartões', level: 2 }),
    ).toBeNull();
    expect(document.querySelector('.wordmark')).toHaveTextContent(
      'MiniFinance',
    );

    fireEvent.click(screen.getByRole('button', { name: /Ana Silva/ }));
    expect(screen.getAllByText('Ana Silva')).toHaveLength(2);
    const themeToggle = screen.getByRole('switch', { name: 'Tema escuro' });
    expect(themeToggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(themeToggle);
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    expect(themeToggle).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('minifinance-theme')).toBe('dark');
    fireEvent.click(themeToggle);
    await waitFor(() =>
      expect(document.documentElement).not.toHaveClass('dark'),
    );
    expect(themeToggle).toHaveAttribute('aria-checked', 'false');
    expect(localStorage.getItem('minifinance-theme')).toBe('light');
  });

  it('keeps the dashboard month selector in the header', () => {
    renderLayout('/');

    expect(screen.getByRole('heading', { name: 'Painel' })).toBeVisible();
    expect(screen.getByText(formatMonth(currentMonth()))).toBeVisible();
    expect(
      within(screen.getByRole('banner')).getByRole('group', {
        name: 'Mês de referência',
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(
      screen.getByText(formatMonth(shiftMonth(currentMonth(), 1))),
    ).toBeVisible();
  });

  it('logs out from the user menu', async () => {
    let loggedOut = false;
    server.use(
      http.post('http://localhost:5173/api/auth/logout', () => {
        loggedOut = true;
        return HttpResponse.json({ data: null });
      }),
    );
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: /Ana Silva/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(loggedOut).toBe(true));
    expect(screen.getByText('Tela de login')).toBeVisible();
  });
});
