import { useState, FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSignup } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';

export default function SignupPage() {
  const { isAuthenticated } = useAuthStore();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const signup = useSignup();

  if (isAuthenticated) return <Navigate to="/" replace />;

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

    signup.mutate({ email, password, firstName, lastName, householdName });
  }

  const errorMessage = validationError
    ?? (signup.error ? (signup.error as any)?.response?.data?.error ?? 'Sign up failed. Please try again.' : null);

  const inputClass = "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg)] text-[var(--color-text)] text-[0.9375rem] outline-none box-border";
  const labelClass = "block text-sm font-medium text-[var(--color-text)] mb-1.5";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-[440px] bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-10">
        <div className="text-center mb-8">
          <h1 className="text-[2rem] font-extrabold text-[var(--color-accent)] m-0 tracking-[-0.02em]">
            Kuber
          </h1>
          <p className="text-[var(--color-text-secondary)] mt-2 text-sm">
            Create your account
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="firstName" className={labelClass}>First Name</label>
              <input id="firstName" type="text" autoComplete="given-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" className={inputClass} />
            </div>
            <div>
              <label htmlFor="lastName" className={labelClass}>Last Name</label>
              <input id="lastName" type="text" autoComplete="family-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" className={inputClass} />
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass} />
          </div>

          <div className="mb-4">
            <label htmlFor="password" className={labelClass}>Password</label>
            <input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" className={inputClass} />
          </div>

          <div className="mb-4">
            <label htmlFor="confirmPassword" className={labelClass}>Confirm Password</label>
            <input id="confirmPassword" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className={inputClass} />
          </div>

          <div className="mb-6">
            <label htmlFor="householdName" className={labelClass}>What should we call your household?</label>
            <input id="householdName" type="text" required value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder="The Smith Family" className={inputClass} />
          </div>

          {errorMessage && (
            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-danger-light)] text-[var(--color-danger)] text-sm mb-4">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={signup.isPending}
            className="w-full py-3 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white font-semibold text-[0.9375rem] border-none transition-opacity duration-150"
            style={{ cursor: signup.isPending ? 'not-allowed' : 'pointer', opacity: signup.isPending ? 0.7 : 1 }}
          >
            {signup.isPending ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-[var(--color-text-secondary)]">
          Already have an account?{' '}
          <Link to="/login" className="text-[var(--color-accent)] no-underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
