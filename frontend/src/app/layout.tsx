import { Wallet } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
          <Link
            to="/"
            className="flex items-center gap-3 text-lg font-semibold tracking-tight"
            aria-label="MiniFinance — início"
          >
            <span className="rounded-xl bg-primary p-2.5 text-primary-foreground">
              <Wallet aria-hidden="true" className="size-5" />
            </span>
            MiniFinance
          </Link>
          <nav aria-label="Navegação principal">
            <NavLink to="/" className="text-sm font-medium text-primary">
              Início
            </NavLink>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-6 pb-8 text-xs text-muted-foreground">
        MiniFinance · Um passo de cada vez.
      </footer>
    </div>
  );
}
