import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLogin } from '@/hooks/useAuth';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password });
  }

  const errorMessage = login.error
    ? (login.error as any)?.response?.data?.error ?? 'Sign in failed. Please try again.'
    : null;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--color-bg)',
      padding: '1rem',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        backgroundColor: 'var(--color-surface)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
        padding: '2.5rem',
      }}>
        {/* Logo / Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: '800',
            color: 'var(--color-accent)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}>
            Kuber
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '0.5rem', fontSize: '0.875rem' }}>
            Sign in to your account
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="email" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: 'var(--color-text)', marginBottom: '0.375rem' }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: '100%',
                padding: '0.625rem 0.875rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-strong)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontSize: '0.9375rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="password" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: 'var(--color-text)', marginBottom: '0.375rem' }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '0.625rem 0.875rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-strong)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontSize: '0.9375rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
              <Link to="/forgot-password" style={{ fontSize: '0.8125rem', color: 'var(--color-accent)', textDecoration: 'none' }}>
                Forgot password?
              </Link>
            </div>
          </div>

          {errorMessage && (
            <div style={{
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-danger-light)',
              color: 'var(--color-danger)',
              fontSize: '0.875rem',
              marginBottom: '1rem',
            }}>
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: login.isPending ? 'var(--color-accent-hover)' : 'var(--color-accent)',
              color: '#fff',
              fontWeight: '600',
              fontSize: '0.9375rem',
              border: 'none',
              cursor: login.isPending ? 'not-allowed' : 'pointer',
              opacity: login.isPending ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: 'var(--color-accent)', textDecoration: 'none', fontWeight: '500' }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
