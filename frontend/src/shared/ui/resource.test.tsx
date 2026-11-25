import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw/http';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/mocks/server';
import { BudgetProgress } from '@/features/budgets/budgets-page';
import { ResourcePage, toPayload, type FieldSpec } from './resource';

const fields: FieldSpec[] = [{ name: 'name', label: 'Nome' }, { name: 'amountCents', label: 'Valor', kind: 'money', min: 1 }, { name: 'count', label: 'Quantidade', kind: 'number', min: 1, max: 3 }];

describe('form and progress behavior', () => {
  it('converts BRL to integer cents and rejects invalid input', () => {
    expect(toPayload(fields, { name: 'Conta', amountCents: '12,34', count: '2' })).toEqual({ name: 'Conta', amountCents: 1234, count: 2 });
    expect(() => toPayload(fields, { name: 'Conta', amountCents: '0,00', count: '2' })).toThrow('valor válido');
    expect(() => toPayload(fields, { name: '', amountCents: '1,00', count: '2' })).toThrow('Informe nome');
    expect(() => toPayload(fields, { name: 'Conta', amountCents: '1,00', count: '4' })).toThrow('valor válido');
  });

  it('shows budget warning and exceeded amount in text', () => {
    const { rerender } = render(<BudgetProgress budget={{ percentageUsed: '82.00', remainingCents: 1800 }} />);
    expect(screen.getByText('82,0% utilizado')).toBeVisible();
    rerender(<BudgetProgress budget={{ percentageUsed: '120.00', remainingCents: -2000 }} />);
    expect(screen.getByText(/Limite excedido em/)).toHaveTextContent('R$');
  });
});

describe('resource interactions', () => {
  it('loads an empty state, creates a record, and refreshes the list through MSW', async () => {
    const user = userEvent.setup();
    const items: { id: string; name: string }[] = [];
    server.use(
      http.get('http://localhost:5173/api/categories', () => HttpResponse.json({ data: items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0 } })),
      http.post('http://localhost:5173/api/categories', async ({ request }) => {
        const body = await request.json() as { name: string };
        items.push({ id: '1', name: body.name });
        return HttpResponse.json({ data: items[0] }, { status: 201 });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ResourcePage title="Categorias" description="Teste" singular="Categoria" path="/categories" fields={[{ name: 'name', label: 'Nome' }]} valuesOf={(item: { id: string; name: string }) => ({ name: item.name })} columns={[{ label: 'Nome', render: (item: { id: string; name: string }) => item.name }]} /></QueryClientProvider>);
    expect(await screen.findByText(/Nenhuma categoria encontrada/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Nova categoria' }));
    await user.type(screen.getByRole('textbox', { name: 'Nome' }), 'Mercado');
    await user.click(screen.getByRole('button', { name: 'Salvar categoria' }));
    expect(await screen.findByRole('cell', { name: 'Mercado' })).toBeVisible();
  });
});
