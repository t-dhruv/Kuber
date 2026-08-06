import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import {
  isMfaLoginResponse,
  mfaMethodLabel,
  useLogin,
  useMfaVerify,
  useSendEmailMfaCode,
  type MfaMethod,
} from "@/hooks/useAuth";
import { Input } from "@/components/ui";
import { getApiErrorMessage } from "@/lib/apiError";

type EmailVerificationError = {
  response?: {
    data?: {
      requireEmailVerification?: boolean;
      email?: string;
    };
  };
};

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "0.75rem",
        borderRadius: "var(--radius-md)",
        backgroundColor: "var(--color-danger-light)",
        color: "var(--color-danger)",
        fontSize: "0.875rem",
        marginBottom: "1rem",
      }}
    >
      {message}
    </div>
  );
}

// ─── Step 1: Email + Password ──────────────────────────────────────────────────

function PasswordStep({
  onRequireMfa,
}: {
  onRequireMfa: (challenge: { tempToken: string; methods: MfaMethod[] }) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const login = useLogin();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password, rememberMe },
      {
        onSuccess: (data) => {
          if (isMfaLoginResponse(data)) {
            onRequireMfa({ tempToken: data.tempToken, methods: data.methods });
          }
        },
        onError: (err) => {
          const data = (err as EmailVerificationError).response?.data;
          if (data?.requireEmailVerification && data.email) {
            setUnverifiedEmail(data.email);
          }
        },
      },
    );
  }

  const errorMessage = login.error && !unverifiedEmail
    ? getApiErrorMessage(login.error, "Sign in failed. Please try again.")
    : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Input
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />

      <div>
        <div className="relative">
          <Input
            id="password"
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-[2.1rem] text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text)] transition-colors"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <div className="text-right mt-1.5">
          <Link
            to="/forgot-password"
            className="text-xs text-[color:var(--color-accent)] hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
        />
        <span className="text-sm text-[color:var(--color-text-secondary)]">
          Remember me for 90 days
        </span>
      </label>

      {unverifiedEmail && (
        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-accent-light)] text-[var(--color-text)] text-sm mb-4">
          Verify {unverifiedEmail} before signing in. Use the link we sent to your inbox.
        </div>
      )}

      {errorMessage && <ErrorBox message={errorMessage} />}

      <button
        type="submit"
        disabled={login.isPending}
        style={{
          width: "100%",
          padding: "0.75rem",
          borderRadius: "var(--radius-md)",
          backgroundColor: login.isPending
            ? "var(--color-accent-hover)"
            : "var(--color-accent)",
          color: "#fff",
          fontWeight: "600",
          fontSize: "0.9375rem",
          border: "none",
          cursor: login.isPending ? "not-allowed" : "pointer",
          opacity: login.isPending ? 0.7 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {login.isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

// ─── Step 2: MFA code ─────────────────────────────────────────────────────────

function MfaStep({
  tempToken,
  methods,
  onBack,
}: {
  tempToken: string;
  methods: MfaMethod[];
  onBack: () => void;
}) {
  const [method, setMethod] = useState<MfaMethod>(methods[0] ?? "totp");
  const [code, setCode] = useState("");
  const verify = useMfaVerify();
  const sendEmail = useSendEmailMfaCode();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    verify.mutate({ tempToken, method, code });
  }

  function handleMethod(nextMethod: MfaMethod) {
    setMethod(nextMethod);
    setCode("");
  }

  const error = verify.error || sendEmail.error;
  const errorMessage = error ? getApiErrorMessage(error, "Invalid code") : null;
  const isPending = verify.isPending;
  const isNumericCode = method !== "backup";

  return (
    <div>
      <p
        style={{
          fontSize: "0.875rem",
          color: "var(--color-text-secondary)",
          marginBottom: "1.5rem",
        }}
      >
        Complete verification to sign in.
      </p>

      <div className="flex gap-2 mb-4">
        {methods.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => handleMethod(item)}
            className="px-3 py-2 rounded-[var(--radius-md)] border text-sm font-medium"
            style={{
              borderColor: item === method ? "var(--color-accent)" : "var(--color-border)",
              color: item === method ? "var(--color-accent)" : "var(--color-text-secondary)",
              backgroundColor: item === method ? "var(--color-accent-light)" : "transparent",
            }}
          >
            {mfaMethodLabel(item)}
          </button>
        ))}
      </div>

      {method === "email" && (
        <button
          type="button"
          onClick={() => sendEmail.mutate(tempToken)}
          disabled={sendEmail.isPending}
          className="mb-4 text-sm text-[var(--color-accent)] font-medium"
          style={{ background: "none", border: "none", padding: 0, cursor: sendEmail.isPending ? "not-allowed" : "pointer" }}
        >
          {sendEmail.isPending ? "Sending…" : "Send email code"}
        </button>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: "1.5rem" }}>
          <Input
            id="mfa-code"
            label={method === "backup" ? "Backup code" : `${mfaMethodLabel(method)} code`}
            type="text"
            inputMode={isNumericCode ? "numeric" : "text"}
            autoComplete="one-time-code"
            value={code}
            onChange={(e) =>
              setCode(isNumericCode
                ? e.target.value.replace(/\D/g, "").slice(0, 6)
                : e.target.value.trim())
            }
            placeholder={isNumericCode ? "000000" : "xxxxxxxxxx"}
            maxLength={isNumericCode ? 6 : undefined}
            className={isNumericCode ? "text-center tracking-widest text-2xl" : undefined}
            autoFocus
          />
        </div>

        {errorMessage && <ErrorBox message={errorMessage} />}

        <button
          type="submit"
          disabled={isPending || !code || (isNumericCode && code.length !== 6)}
          style={{
            width: "100%",
            padding: "0.75rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-accent)",
            color: "#fff",
            fontWeight: "600",
            fontSize: "0.9375rem",
            border: "none",
            cursor: isPending || !code || (isNumericCode && code.length !== 6) ? "not-allowed" : "pointer",
            opacity: isPending || !code || (isNumericCode && code.length !== 6) ? 0.6 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {isPending ? "Verifying…" : "Verify"}
        </button>
      </form>

      <div
        style={{
          marginTop: "1rem",
          fontSize: "0.8125rem",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-accent)",
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← Back
        </button>
      </div>
    </div>
  );
}

// ─── Main LoginPage ───────────────────────────────────────────────────────────

export default function LoginPage() {
  const [mfaChallenge, setMfaChallenge] = useState<{ tempToken: string; methods: MfaMethod[] } | null>(null);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-bg)",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        {/* Logo + wordmark */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.875rem",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "var(--radius-lg)",
              backgroundColor: "var(--color-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "1.5rem",
              fontWeight: 700,
              boxShadow: "var(--shadow-md)",
            }}
          >
            K
          </div>
          <div style={{ textAlign: "center" }}>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "2rem",
                fontWeight: 800,
                color: "var(--color-accent)",
                margin: 0,
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              Kuber
            </h1>
            <p
              style={{
                color: "var(--color-text-muted)",
                marginTop: "0.375rem",
                fontSize: "0.8125rem",
              }}
            >
              Your finances, your server, your rules.
            </p>
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            borderRadius: "var(--radius-xl)",
            boxShadow: "var(--shadow-lg)",
            border: "1px solid var(--color-border)",
            padding: "2rem",
          }}
        >
          <div style={{ marginBottom: "1.5rem" }}>
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "var(--color-text)",
                margin: 0,
              }}
            >
              {mfaChallenge
                ? "Multi-factor authentication"
                : "Sign in to your account"}
            </h2>
            {!mfaChallenge && (
              <p
                style={{
                  color: "var(--color-text-secondary)",
                  marginTop: "0.25rem",
                  fontSize: "0.8125rem",
                  margin: "0.25rem 0 0",
                }}
              >
                Access your self-hosted finance server.
              </p>
            )}
          </div>

          {mfaChallenge ? (
            <MfaStep
              tempToken={mfaChallenge.tempToken}
              methods={mfaChallenge.methods}
              onBack={() => setMfaChallenge(null)}
            />
          ) : (
            <>
              <PasswordStep onRequireMfa={setMfaChallenge} />
              <p
                style={{
                  textAlign: "center",
                  marginTop: "1.25rem",
                  fontSize: "0.875rem",
                  color: "var(--color-text-secondary)",
                }}
              >
                Don't have an account?{" "}
                <Link
                  to="/signup"
                  style={{
                    color: "var(--color-accent)",
                    textDecoration: "none",
                    fontWeight: "500",
                  }}
                >
                  Sign up
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
