import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');

  const mutation = useMutation({
    mutationFn: (data: { email: string }) => api.post('/auth/forgot-password', data),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({ email });
  }

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
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--color-accent)', margin: 0, letterSpacing: '-0.02em' }}>
            Kuber
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '0.5rem', fontSize: '0.875rem' }}>
            Reset your password
          </p>
        </div>

        {mutation.isSuccess ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              padding: '1rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-success-light)',
              color: 'var(--color-success)',
              fontSize: '0.9375rem',
              marginBottom: '1.5rem',
            }}>
              Check your email for a reset link.
            </div>
            <Link to="/login" style={{ color: 'var(--color-accent)', textDecoration: 'none', fontSize: '0.875rem', fontWeight: '500' }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem', marginTop: 0 }}>
              Enter your email and we'll send you a link to reset your password.
            </p>

            <div style={{ marginBottom: '1.5rem' }}>
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

            {mutation.error && (
              <div style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-danger-light)',
                color: 'var(--color-danger)',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}>
                {(mutation.error as any)?.response?.data?.error ?? 'Something went wrong. Please try again.'}
              </div>
            )}

            <button
              type="submit"
              disabled={mutation.isPending}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-accent)',
                color: '#fff',
                fontWeight: '600',
                fontSize: '0.9375rem',
                border: 'none',
                cursor: mutation.isPending ? 'not-allowed' : 'pointer',
                opacity: mutation.isPending ? 0.7 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {mutation.isPending ? 'Sending…' : 'Send reset link'}
            </button>

            <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              <Link to="/login" style={{ color: 'var(--color-accent)', textDecoration: 'none', fontWeight: '500' }}>
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
