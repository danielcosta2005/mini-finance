import { useQueryClient } from '@tanstack/react-query';
import {
  ChartNoAxesCombined,
  ChevronDown,
  CreditCard,
  Goal,
  LayoutDashboard,
  ListTree,
  LogOut,
  Moon,
  Repeat2,
  Sun,
  Tags,
  WalletCards,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogoMark } from '@/components/layout/logo-mark';
import { MonthSelector } from '@/components/layout/month-selector';
import { api } from '@/lib/api';
import { currentMonth } from '@/lib/format';
import type { User } from '@/lib/types';

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

function Navigation() {
  return (
    <nav aria-label="Navegação principal" className="nav-list">
      {navigation.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          aria-label={label}
          title={label}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('');
}

function UserMenu({ name, onLogout }: { name: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="user-menu">
      <button
        type="button"
        className="user-menu-trigger"
        aria-label={`Menu do usuário ${name}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="user-avatar" aria-hidden="true">
          {initials(name)}
        </span>
        <span className="user-name">{name}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="user-menu-panel">
          <div className="user-menu-heading">{name}</div>
          <button type="button" className="user-menu-action" onClick={onLogout}>
            <LogOut size={16} aria-hidden="true" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

function ThemeToggle({
  dark,
  onToggle,
}: {
  dark: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="sidebar-footer">
      <span className="theme-label">Tema</span>
      <button
        type="button"
        className="theme-toggle"
        role="switch"
        aria-label="Tema escuro"
        aria-checked={dark}
        onClick={onToggle}
      >
        <Sun size={15} aria-hidden="true" />
        <span className="theme-toggle-thumb" />
        <Moon size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`wordmark ${compact ? 'compact' : ''}`}>
      <LogoMark className="brand-mark" size={20} />
      {!compact && (
        <span className="wordmark-name">
          <span className="wordmark-mini">Mini</span>
          <span className="wordmark-finance">Finance</span>
        </span>
      )}
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [theme, setTheme] = useState(
    () => localStorage.getItem('minifinance-theme') ?? 'system',
  );
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (event: MediaQueryListEvent) => {
      setSystemDark(event.matches);
      document.documentElement.classList.toggle(
        'dark',
        theme === 'dark' || (theme === 'system' && event.matches),
      );
    };
    setSystemDark(media.matches);
    document.documentElement.classList.toggle(
      'dark',
      theme === 'dark' || (theme === 'system' && media.matches),
    );
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
  const user = client.getQueryData<User>(['session']);
  const name = user?.name || 'Usuário';
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } finally {
      client.clear();
      navigate('/login', { replace: true });
    }
  }
  function toggleTheme() {
    const next =
      theme === 'dark' || (theme === 'system' && systemDark) ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('minifinance-theme', next);
  }
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Wordmark />
        <Navigation />
        <ThemeToggle dark={dark} onToggle={toggleTheme} />
      </aside>
      <div className="main-shell">
        <header className="app-header">
          <div className="header-title">
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            {location.pathname === '/' && (
              <MonthSelector value={month} onChange={setMonth} />
            )}
            <UserMenu name={name} onLogout={logout} />
          </div>
        </header>
        <main className="content">
          <Outlet context={{ month, setMonth }} />
        </main>
      </div>
    </div>
  );
}
