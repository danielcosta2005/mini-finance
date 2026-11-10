import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw/http';
import { describe, expect, it } from 'vitest';
import { server } from '../../../tests/mocks/server';
import { HomePage } from './home-page';

function renderHome() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HomePage />
    </QueryClientProvider>,
  );
}

describe('Home', () => {
  it('shows the welcome page and a successful health response', async () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Seu controle financeiro começa aqui',
    );
    expect(await screen.findByText('Backend disponível')).toBeVisible();
  });

  it('shows an unavailable status when the health request fails', async () => {
    server.use(
      http.get(
        'http://localhost:5173/api/health',
        () => new HttpResponse(null, { status: 503 }),
      ),
    );
    renderHome();
    expect(await screen.findByText('Backend indisponível')).toBeVisible();
  });
});
