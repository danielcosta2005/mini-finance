import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { getHealth } from './api/health';

export function HomePage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth(signal),
    staleTime: 30_000,
  });

  const status = health.isPending
    ? 'Verificando conexão…'
    : health.isError
      ? 'Backend indisponível'
      : 'Backend disponível';

  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:py-24">
      <section className="max-w-3xl">
        <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Seu próximo começo
        </p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
          Seu controle financeiro começa aqui.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          Bem-vindo ao MiniFinance. Estamos preparando um espaço simples para
          organizar sua vida financeira.
        </p>
      </section>

      <section
        aria-labelledby="connection-title"
        className="grid gap-8 rounded-2xl border border-border bg-card p-7 md:grid-cols-[1fr_auto] md:items-center md:p-9"
      >
        <div>
          <span className="mb-5 inline-flex rounded-xl bg-primary/10 p-3 text-primary">
            <ArrowUpRight aria-hidden="true" className="size-5" />
          </span>
          <h2 id="connection-title" className="text-lg font-semibold">
            Conexão com a API
          </h2>
          <p
            role="status"
            aria-live="polite"
            className="mt-2 text-sm text-muted-foreground"
          >
            {status}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void health.refetch()}
          disabled={health.isFetching}
        >
          <RefreshCw aria-hidden="true" /> Verificar conexão
        </Button>
      </section>
    </div>
  );
}
