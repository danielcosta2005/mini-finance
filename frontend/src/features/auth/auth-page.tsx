import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { LogoMark } from '@/components/layout/logo-mark';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';
import { Feedback } from '@/shared/ui/resource';

const credentials = z.object({
  email: z.email('Informe um e-mail válido.'),
  password: z.string().min(12, 'A senha deve ter pelo menos 12 caracteres.'),
});
const register = credentials.extend({
  name: z.string().trim().min(1, 'Informe seu nome.').max(120),
});

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = (mode === 'register' ? register : credentials).safeParse(
      mode === 'register' ? { name, email, password } : { email, password },
    );
    if (!result.success) {
      setError(
        new Error(result.error.issues[0]?.message ?? 'Confira os campos.'),
      );
      return;
    }
    setPending(true);
    setError(null);
    try {
      const user = await api<User>(
        `/auth/${mode === 'register' ? 'register' : 'login'}`,
        { method: 'POST', body: result.data },
      );
      client.setQueryData(['session'], user);
      navigate('/', { replace: true });
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="auth-shell">
      <div className="auth-box bordered">
        <div className="wordmark">
          <LogoMark className="brand-mark" size={20} />
          <span className="wordmark-name">
            <span className="wordmark-mini">Mini</span>
            <span className="wordmark-finance">Finance</span>
          </span>
        </div>
        <h1>{mode === 'register' ? 'Criar conta' : 'Entrar'}</h1>
        <form className="form" onSubmit={submit}>
          {mode === 'register' && (
            <div className="field">
              <label htmlFor="name">Nome</label>
              <input
                id="name"
                autoComplete="name"
                required
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              autoComplete={
                mode === 'register' ? 'new-password' : 'current-password'
              }
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <Feedback error={error} />
          <button className="button" type="submit" disabled={pending}>
            {pending
              ? 'Aguarde…'
              : mode === 'register'
                ? 'Criar conta'
                : 'Entrar'}
          </button>
        </form>
        <footer>
          {mode === 'register' ? (
            <>
              Já tem conta?{' '}
              <Link className="button-link" to="/login">
                Entrar
              </Link>
            </>
          ) : (
            <>
              Ainda não tem conta?{' '}
              <Link className="button-link" to="/cadastro">
                Criar conta
              </Link>
            </>
          )}
        </footer>
      </div>
    </main>
  );
}
