import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Link, RouterProvider } from 'react-router-dom';
import { HomePage } from '@/features/home/home-page';
import { Layout } from './layout';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      {
        path: '*',
        element: (
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h1 className="mb-4 text-2xl font-semibold">
              Página não encontrada
            </h1>
            <Link to="/" className="underline">
              Voltar ao início
            </Link>
          </div>
        ),
      },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
