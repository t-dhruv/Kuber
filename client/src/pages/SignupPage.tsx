import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSignup } from '@/hooks/useAuth';

export default function SignupPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const signup = useSignup();

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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.625rem 0.875rem',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-strong)',
    backgroundColor: 'var(--color-bg)',
    color: 'var(--color-text)',
    fontSize: '0.9375rem',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: '500',
    color: 'var(--color-text)',
    marginBottom: '0.375rem',
  };

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
        maxWidth: '440px',
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
            Create your account
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label htmlFor="firstName" style={labelStyle}>First Name</label>
              <input id="firstName" type="text" autoComplete="given-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="lastName" style={labelStyle}>Last Name</label>
              <input id="lastName" type="text" autoComplete="family-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Smith" style={inputStyle} />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="email" style={labelStyle}>Email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="password" style={labelStyle}>Password</label>
            <input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" style={inputStyle} />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="confirmPassword" style={labelStyle}>Confirm Password</label>
            <input id="confirmPassword" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" style={inputStyle} />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="householdName" style={labelStyle}>What should we call your household?</label>
            <input id="householdName" type="text" required value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder="The Smith Family" style={inputStyle} />
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
            disabled={signup.isPending}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-accent)',
              color: '#fff',
              fontWeight: '600',
              fontSize: '0.9375rem',
              border: 'none',
              cursor: signup.isPending ? 'not-allowed' : 'pointer',
              opacity: signup.isPending ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {signup.isPending ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--color-accent)', textDecoration: 'none', fontWeight: '500' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
