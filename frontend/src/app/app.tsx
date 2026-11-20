import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from 'react-router-dom';
import { AccountsPage } from '@/features/accounts/accounts-page';
import { AuthPage } from '@/features/auth/auth-page';
import { BudgetsPage } from '@/features/budgets/budgets-page';
import { CardsPage } from '@/features/cards/cards-page';
import { CategoriesPage } from '@/features/categories/categories-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { GoalsPage } from '@/features/goals/goals-page';
import { RecurrencesPage } from '@/features/recurrences/recurrences-page';
import { TransactionsPage } from '@/features/transactions/transactions-page';
import { ApiError, api } from '@/lib/api';
import type { User } from '@/lib/types';
import { Layout } from './layout';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) =>
        count < 1 && !(error instanceof ApiError && error.status === 401),
      refetchOnWindowFocus: false,
    },
  },
});

function Protected() {
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => api<User>('/auth/me'),
    staleTime: 30_000,
  });
  if (session.isPending)
    return (
      <main className="centered" role="status">
        Carregando sessão…
      </main>
    );
  if (session.error instanceof ApiError && session.error.status === 401)
    return <Navigate to="/login" replace />;
  if (session.isError)
    return (
      <main className="centered">
        <p role="alert">Não foi possível verificar sua sessão.</p>
        <button type="button" onClick={() => session.refetch()}>
          Tentar novamente
        </button>
      </main>
    );
  return <Outlet />;
}

const router = createBrowserRouter([
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/cadastro', element: <AuthPage mode="register" /> },
  {
    element: <Protected />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/contas', element: <AccountsPage /> },
          { path: '/transacoes', element: <TransactionsPage /> },
          { path: '/categorias', element: <CategoriesPage /> },
          { path: '/cartoes', element: <CardsPage /> },
          { path: '/orcamentos', element: <BudgetsPage /> },
          { path: '/recorrencias', element: <RecurrencesPage /> },
          { path: '/metas', element: <GoalsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
