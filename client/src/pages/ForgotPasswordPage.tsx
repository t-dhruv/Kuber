import { useState, FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export default function ForgotPasswordPage() {
  const { isAuthenticated } = useAuthStore();
  const [email, setEmail] = useState('');

  const mutation = useMutation({
    mutationFn: (data: { email: string }) => api.post('/auth/forgot-password', data),
  });

  if (isAuthenticated) return <Navigate to="/" replace />;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate({ email });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-[400px] bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-10">
        <div className="text-center mb-8">
          <h1 className="text-[2rem] font-extrabold text-[var(--color-accent)] m-0 tracking-[-0.02em]">
            Kuber
          </h1>
          <p className="text-[var(--color-text-secondary)] mt-2 text-sm">
            Reset your password
          </p>
        </div>

        {mutation.isSuccess ? (
          <div className="text-center">
            <div className="p-4 rounded-[var(--radius-md)] bg-[var(--color-success-light)] text-[var(--color-success)] text-[0.9375rem] mb-6">
              Check your email for a reset link.
            </div>
            <Link to="/login" className="text-[var(--color-accent)] no-underline text-sm font-medium">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <p className="text-[var(--color-text-secondary)] text-sm mb-5 mt-0">
              Enter your email and we'll send you a link to reset your password.
            </p>

            <div className="mb-6">
              <label htmlFor="email" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
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
                className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] text-[var(--color-text)] text-[0.9375rem] outline-none box-border"
              />
            </div>

            {mutation.error && (
              <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-danger-light)] text-[var(--color-danger)] text-sm mb-4">
                {(mutation.error as any)?.response?.data?.error ?? 'Something went wrong. Please try again.'}
              </div>
            )}

            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full py-3 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white font-semibold text-[0.9375rem] border-none transition-opacity duration-150"
              style={{ cursor: mutation.isPending ? 'not-allowed' : 'pointer', opacity: mutation.isPending ? 0.7 : 1 }}
            >
              {mutation.isPending ? 'Sending…' : 'Send reset link'}
            </button>

            <p className="text-center mt-6 text-sm text-[var(--color-text-secondary)]">
              <Link to="/login" className="text-[var(--color-accent)] no-underline font-medium">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
