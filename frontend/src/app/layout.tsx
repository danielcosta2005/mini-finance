import { useQueryClient } from '@tanstack/react-query';
import {
  ChartNoAxesCombined,
  CreditCard,
  Goal,
  LayoutDashboard,
  ListTree,
  LogOut,
  Menu,
  Repeat2,
  Tags,
  WalletCards,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { Sheet } from '@/shared/ui/sheet';

const navigation = [
  { to: '/', label: 'Painel', icon: LayoutDashboard },
  { to: '/contas', label: 'Contas', icon: WalletCards },
  { to: '/transacoes', label: 'Transações', icon: ListTree },
  { to: '/categorias', label: 'Categorias', icon: Tags },
  { to: '/cartoes', label: 'Cartões', icon: CreditCard },
  { to: '/orcamentos', label: 'Orçamentos', icon: ChartNoAxesCombined },
  { to: '/recorrencias', label: 'Recorrências', icon: Repeat2 },
  { to: '/metas', label: 'Metas', icon: Goal },
];

function Navigation({ close }: { close?: () => void }) {
  return (
    <nav aria-label="Navegação principal" className="nav-list">
      {navigation.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          title={label}
          onClick={close}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem('minifinance-theme') ?? 'system',
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.classList.toggle(
        'dark',
        theme === 'dark' || (theme === 'system' && media.matches),
      );
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    const expired = () => {
      client.removeQueries({ queryKey: ['session'] });
      navigate('/login', { replace: true });
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [client, navigate]);
  const title =
    navigation.find((item) => item.to === location.pathname)?.label ??
    'MiniFinance';
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } finally {
      client.clear();
      navigate('/login', { replace: true });
    }
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="wordmark">MiniFinance</div>
        <Navigation />
        <div className="sidebar-bottom">
          <label htmlFor="theme">Tema</label>
          <select
            id="theme"
            value={theme}
            onChange={(event) => {
              setTheme(event.target.value);
              localStorage.setItem('minifinance-theme', event.target.value);
            }}
          >
            <option value="system">Seguir sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>
          <button type="button" className="nav-item" onClick={logout}>
            <LogOut size={18} />
            <span>Sair</span>
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="app-header">
          <button
            className="mobile-menu icon-button"
            type="button"
            aria-label="Abrir menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          <h1>{title}</h1>
          <span className="header-user">MiniFinance</span>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <Sheet
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        title="MiniFinance"
        side="left"
      >
        <Navigation close={() => setMobileOpen(false)} />
        <div className="sidebar-bottom">
          <label htmlFor="mobile-theme">Tema</label>
          <select
            id="mobile-theme"
            value={theme}
            onChange={(event) => {
              setTheme(event.target.value);
              localStorage.setItem('minifinance-theme', event.target.value);
            }}
          >
            <option value="system">Seguir sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>
          <button type="button" className="nav-item" onClick={logout}>
            <LogOut size={18} />
            Sair
          </button>
        </div>
      </Sheet>
    </div>
  );
}
