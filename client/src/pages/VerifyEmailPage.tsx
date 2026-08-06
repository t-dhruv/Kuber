import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useVerifyEmail } from '@/hooks/useAuth';
import { getApiErrorMessage } from '@/lib/apiError';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const verifyEmail = useVerifyEmail();

  useEffect(() => {
    if (token && verifyEmail.isIdle) {
      verifyEmail.mutate(token);
    }
  }, [token, verifyEmail]);

  const title = !token
    ? 'Invalid verification link'
    : verifyEmail.isSuccess
      ? 'Email verified'
      : verifyEmail.isError
        ? 'Verification failed'
        : 'Verifying email';

  const body = !token
    ? 'The verification link is missing its token.'
    : verifyEmail.isSuccess
      ? 'Your email is verified. You can now sign in.'
      : verifyEmail.isError
        ? getApiErrorMessage(verifyEmail.error, 'This verification link is invalid or expired.')
        : 'Please wait while we verify your email.';

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-[440px] bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-10">
        <h1 className="text-[2rem] font-extrabold text-[var(--color-accent)] m-0">{title}</h1>
        <p className="text-[var(--color-text-secondary)] mt-4 text-sm">{body}</p>
        <Link to="/login" className="inline-flex mt-6 text-[var(--color-accent)] no-underline font-medium">
          Sign in
        </Link>
      </div>
    </div>
  );
}
