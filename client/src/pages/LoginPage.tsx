import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useLogin, useTotpValidate, useTotpBackup } from "@/hooks/useAuth";
import { Input } from "@/components/ui";

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
  onRequireTotp,
}: {
  onRequireTotp: (tempToken: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const login = useLogin();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate(
      { email, password, rememberMe },
      {
        onSuccess: (data) => {
          if (data.requireTotp) onRequireTotp(data.tempToken);
        },
      },
    );
  }

  const errorMessage = login.error
    ? ((login.error as any)?.response?.data?.error ??
      "Sign in failed. Please try again.")
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

// ─── Step 2: TOTP code ────────────────────────────────────────────────────────

function TotpStep({
  tempToken,
  onBack,
}: {
  tempToken: string;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [showBackup, setShowBackup] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const validate = useTotpValidate();
  const backup = useTotpBackup();

  function handleTotp(e: FormEvent) {
    e.preventDefault();
    validate.mutate({ tempToken, code });
  }

  function handleBackup(e: FormEvent) {
    e.preventDefault();
    backup.mutate({ tempToken, backupCode });
  }

  const error = validate.error || backup.error;
  const errorMessage = error
    ? ((error as any)?.response?.data?.error ?? "Invalid code")
    : null;
  const isPending = validate.isPending || backup.isPending;

  return (
    <div>
      <p
        style={{
          fontSize: "0.875rem",
          color: "var(--color-text-secondary)",
          marginBottom: "1.5rem",
        }}
      >
        Open your authenticator app and enter the 6-digit code for Kuber.
      </p>

      {!showBackup ? (
        <form onSubmit={handleTotp} noValidate>
          <div style={{ marginBottom: "1.5rem" }}>
            <Input
              id="totp"
              label="Authenticator code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              maxLength={6}
              className="text-center tracking-widest text-2xl"
              autoFocus
            />
          </div>

          {errorMessage && <ErrorBox message={errorMessage} />}

          <button
            type="submit"
            disabled={isPending || code.length !== 6}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-accent)",
              color: "#fff",
              fontWeight: "600",
              fontSize: "0.9375rem",
              border: "none",
              cursor:
                isPending || code.length !== 6 ? "not-allowed" : "pointer",
              opacity: isPending || code.length !== 6 ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {isPending ? "Verifying…" : "Verify"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleBackup} noValidate>
          <div style={{ marginBottom: "1.5rem" }}>
            <Input
              id="backup"
              label="Backup code"
              type="text"
              value={backupCode}
              onChange={(e) => setBackupCode(e.target.value.trim())}
              placeholder="xxxxxxxxxx"
              autoFocus
            />
          </div>

          {errorMessage && <ErrorBox message={errorMessage} />}

          <button
            type="submit"
            disabled={isPending || !backupCode}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-accent)",
              color: "#fff",
              fontWeight: "600",
              fontSize: "0.9375rem",
              border: "none",
              cursor: isPending || !backupCode ? "not-allowed" : "pointer",
              opacity: isPending || !backupCode ? 0.6 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {isPending ? "Verifying…" : "Use backup code"}
          </button>
        </form>
      )}

      <div
        style={{
          marginTop: "1rem",
          display: "flex",
          justifyContent: "space-between",
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
        <button
          onClick={() => setShowBackup((b) => !b)}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-accent)",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {showBackup ? "Use authenticator app" : "Use a backup code"}
        </button>
      </div>
    </div>
  );
}

// ─── Main LoginPage ───────────────────────────────────────────────────────────

export default function LoginPage() {
  const [tempToken, setTempToken] = useState<string | null>(null);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--color-bg)",
        padding: "1rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "400px", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Logo + wordmark */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.875rem" }}>
          <div style={{
            width: 56, height: 56,
            borderRadius: "var(--radius-lg)",
            backgroundColor: "var(--color-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: "1.5rem", fontWeight: 700,
            boxShadow: "var(--shadow-md)",
          }}>
            K
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: "2rem",
              fontWeight: 800,
              color: "var(--color-accent)",
              margin: 0,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}>
              Kuber
            </h1>
            <p style={{ color: "var(--color-text-muted)", marginTop: "0.375rem", fontSize: "0.8125rem" }}>
              Your finances, your server, your rules.
            </p>
          </div>
        </div>

        {/* Card */}
        <div style={{
          backgroundColor: "var(--color-surface)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          border: "1px solid var(--color-border)",
          padding: "2rem",
        }}>
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
              {tempToken ? "Two-factor authentication" : "Sign in to your account"}
            </h2>
            {!tempToken && (
              <p style={{ color: "var(--color-text-secondary)", marginTop: "0.25rem", fontSize: "0.8125rem", margin: "0.25rem 0 0" }}>
                Access your self-hosted finance server.
              </p>
            )}
          </div>

          {tempToken ? (
            <TotpStep tempToken={tempToken} onBack={() => setTempToken(null)} />
          ) : (
            <>
              <PasswordStep onRequireTotp={setTempToken} />
              <p style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
                Don't have an account?{" "}
                <Link to="/signup" style={{ color: "var(--color-accent)", textDecoration: "none", fontWeight: "500" }}>
                  Sign up
                </Link>
              </p>
            </>
          )}
        </div>

        {/* Server indicator */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", fontSize: "0.75rem", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "var(--color-success)", display: "inline-block" }} />
          Self-hosted · kuber.local
        </div>
      </div>
    </div>
  );
}
