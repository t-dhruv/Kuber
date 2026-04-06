import { useState, FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: { token: string; password: string }) => api.post('/auth/reset-password', data),
    onSuccess: () => navigate('/login'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters');
      return;
    }

    mutation.mutate({ token, password });
  }

  const errorMessage = validationError
    ?? (mutation.error ? (mutation.error as any)?.response?.data?.error ?? 'Something went wrong. Please try again.' : null);

  const inputClass = "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] text-[var(--color-text)] text-[0.9375rem] outline-none box-border";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-[400px] bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-10">
        <div className="text-center mb-8">
          <h1 className="text-[2rem] font-extrabold text-[var(--color-accent)] m-0 tracking-[-0.02em]">
            Kuber
          </h1>
          <p className="text-[var(--color-text-secondary)] mt-2 text-sm">
            Choose a new password
          </p>
        </div>

        {!token ? (
          <div className="text-center">
            <p className="text-[var(--color-danger)] mb-4">Invalid reset link.</p>
            <Link to="/forgot-password" className="text-[var(--color-accent)] no-underline text-sm font-medium">
              Request a new one
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                New Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className={inputClass}
              />
            </div>

            <div className="mb-6">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className={inputClass}
              />
            </div>

            {errorMessage && (
              <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-danger-light)] text-[var(--color-danger)] text-sm mb-4">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full py-3 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white font-semibold text-[0.9375rem] border-none transition-opacity duration-150"
              style={{ cursor: mutation.isPending ? 'not-allowed' : 'pointer', opacity: mutation.isPending ? 0.7 : 1 }}
            >
              {mutation.isPending ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
