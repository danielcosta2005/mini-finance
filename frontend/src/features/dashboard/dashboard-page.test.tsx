import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Dashboard } from '@/lib/types';
import { server } from '../../../tests/mocks/server';
import { DashboardPage } from './dashboard-page';

const monthlyData: Dashboard = {
  month: '2026-11',
  totals: {
    balanceCents: 0,
    incomeCents: 12000,
    expenseCents: 5000,
    netCents: 7000,
  },
  accounts: [],
  categories: [
    {
      categoryId: '1',
      name: 'Mercado',
      type: 'expense',
      amountCents: 5000,
      percentage: '50',
    },
    {
      categoryId: '2',
      name: 'Moradia',
      type: 'expense',
      amountCents: 3000,
      percentage: '30',
    },
    {
      categoryId: '3',
      name: 'Transporte',
      type: 'expense',
      amountCents: 1000,
      percentage: '10',
    },
    {
      categoryId: '4',
      name: 'Saúde',
      type: 'expense',
      amountCents: 500,
      percentage: '5',
    },
    {
      categoryId: '5',
      name: 'Lazer',
      type: 'expense',
      amountCents: 500,
      percentage: '5',
    },
  ],
  evolution: [
    {
      month: '2025-12',
      incomeCents: 10000,
      expenseCents: 7000,
      netCents: 3000,
    },
    {
      month: '2026-01',
      incomeCents: 10000,
      expenseCents: 7000,
      netCents: 3000,
    },
    {
      month: '2026-10',
      incomeCents: 10000,
      expenseCents: 7000,
      netCents: 3000,
    },
    {
      month: '2026-11',
      incomeCents: 12000,
      expenseCents: 5000,
      netCents: 7000,
    },
  ],
  budgets: {
    limitCents: 0,
    spentCents: 0,
    remainingCents: 0,
    progressPercentage: '0',
    overBudgetCount: 0,
    items: [],
  },
};

function renderDashboard(data: Dashboard) {
  server.use(
    http.get('http://localhost:5173/api/dashboard', () =>
      HttpResponse.json({ data }),
    ),
    http.get('http://localhost:5173/api/transactions', () =>
      HttpResponse.json({
        data: [],
        pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 },
      }),
    ),
    http.get('http://localhost:5173/api/recurrences', () =>
      HttpResponse.json({
        data: [],
        pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      }),
    ),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <Outlet
                context={{ month: '2026-11', setMonth: () => undefined }}
              />
            }
          >
            <Route index element={<DashboardPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('dashboard presentation', () => {
  it('shows an extended month, neutral zero balance, direct series labels, and aggregated categories', async () => {
    renderDashboard(monthlyData);

    expect(await screen.findByText('Saldo consolidado')).toBeVisible();
    expect(screen.queryByText('Competência 2026-11')).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Resumo financeiro' }),
    ).toBeNull();
    expect(screen.getByText(/Resultado de novembro:/)).toHaveTextContent(
      /\+R\$\s70,00/,
    );
    expect(screen.getByText(/R\$\s0,00/)).toHaveClass('value');
    expect(screen.getByText('Receitas')).toBeVisible();
    expect(screen.getByText('Despesas')).toBeVisible();
    expect(screen.queryByText(/\d{4}-\d{2}/)).toBeNull();
    expect(
      screen
        .getByText('Receitas do mês')
        .parentElement?.querySelector('strong'),
    ).toHaveClass('income');
    expect(
      screen
        .getByText('Despesas do mês')
        .parentElement?.querySelector('strong'),
    ).toHaveClass('expense');
    expect(screen.getByText('Receitas do mês').parentElement).toHaveTextContent(
      /\+R\$\s120,00/,
    );
    expect(screen.getByText('Despesas do mês').parentElement).toHaveTextContent(
      /−R\$\s50,00/,
    );
    expect(screen.getByText(/\+R\$\s20,00 vs\. outubro/)).toBeVisible();
    expect(screen.getByText(/−R\$\s20,00 vs\. outubro/)).toBeVisible();
    expect(screen.getByText('dez 2025')).toBeVisible();
    expect(screen.getByText('jan 2026')).toBeVisible();
    expect(screen.getByText('Outras')).toBeVisible();
    expect(
      screen
        .getByText('Mercado')
        .closest('.compact-row')
        ?.querySelector('.category-bar'),
    ).toHaveClass('category-tone-1');
    expect(
      screen
        .getByText('Outras')
        .closest('.compact-row')
        ?.querySelector('.category-bar'),
    ).toHaveClass('category-other');
  });

  it('replaces a fully zero cash-flow chart with the direct empty state and action', async () => {
    renderDashboard({
      ...monthlyData,
      totals: { balanceCents: 0, incomeCents: 0, expenseCents: 0, netCents: 0 },
      categories: [],
      evolution: Array.from({ length: 12 }, (_, index) => ({
        month: `2026-${String(index + 1).padStart(2, '0')}`,
        incomeCents: 0,
        expenseCents: 0,
        netCents: 0,
      })),
    });

    expect(await screen.findByText('Saldo consolidado')).toBeVisible();
    expect(screen.getByText(/Resultado de novembro:/)).toHaveTextContent(
      /\+R\$\s0,00/,
    );
    for (const label of [
      'Saldo consolidado',
      'Receitas do mês',
      'Despesas do mês',
    ]) {
      const total = screen
        .getByText(label)
        .parentElement?.querySelector('strong');
      expect(total).not.toHaveClass('income');
      expect(total).not.toHaveClass('expense');
    }
    expect(
      screen.getByText('Sem movimentação nos últimos 12 meses.'),
    ).toBeVisible();
    const chartEmpty = document.querySelector('.chart-empty');
    expect(chartEmpty).not.toBeNull();
    expect(
      within(chartEmpty as HTMLElement).getByRole('link', {
        name: 'Adicionar transação',
      }),
    ).toHaveAttribute('href', '/transacoes');
    expect(screen.queryByRole('img', { name: /Evolução mensal/ })).toBeNull();
  });
});
