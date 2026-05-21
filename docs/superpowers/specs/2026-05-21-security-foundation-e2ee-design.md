# Security Foundation and Field-Level E2EE Design

## Scope

This design defines a staged security foundation for Kuber:

- Email verification for new and existing users.
- Email one-time passcode as an optional MFA method.
- A generalized MFA login flow that preserves existing TOTP and backup-code support.
- Field-level client-side encryption for high-sensitivity finance data, with a path toward stricter zero-knowledge behavior later.

This is intentionally not a full zero-knowledge rewrite. Kuber's server currently computes balances, reports, budgets, rules, imports, exports, AI context, and household access. The first E2EE milestone should protect the most sensitive text, secrets, and document content while preserving server-side finance math and core product behavior.

## Goals

- Verify that users control their email before they access the app fully.
- Support email OTP MFA for users who cannot or will not use an authenticator app.
- Keep authenticator app MFA as the recommended stronger option.
- Avoid storing raw auth tokens, OTP codes, or encryption keys server-side.
- Encrypt sensitive user-entered fields in the browser before they leave the client.
- Preserve household scoping, soft-delete behavior, reporting, balances, and financial calculations.
- Provide a clean migration path from current plaintext fields to encrypted field envelopes.
- Make password reset, MFA reset, and encryption recovery behavior explicit.

## Non-Goals

- Full zero-knowledge encryption of all financial metadata in the first milestone.
- Server-side searchable encrypted text indexes in the first milestone.
- Replacing JWT access tokens or refresh-cookie authentication.
- Making email OTP equivalent in strength to TOTP.
- Recovering encrypted data after key loss without a recovery mechanism chosen by the user.

## Existing Context

Current auth behavior:

- Signup creates a user, creates or joins a household, seeds default categories, sets refresh cookie, and returns `{ user, accessToken }`.
- Login validates password and returns full auth unless `totpEnabled` is true.
- TOTP login returns `{ requireTotp: true, tempToken }` and then exchanges the temp token plus code for full auth.
- Backup codes exist and are hashed.
- Password reset uses a random token stored as a `UserPreference` key.
- Email delivery already exists through `sendMail`, Resend, SMTP, and env fallback.
- AI and email provider secrets are encrypted server-side with an environment key, which is encryption at rest, not E2EE.

Current sensitive finance data is mostly plaintext in PostgreSQL. The server reads and transforms accounts, transactions, categories, budgets, goals, reports, AI conversations, imports, attachments, and settings.

## Architecture Overview

The implementation should be split into three phases.

### Phase 1: Email Verification

Add email verification as a first-class auth state.

Data model:

- Add `User.emailVerifiedAt DateTime?`.
- Add a dedicated `AuthToken` or `UserSecurityToken` model instead of adding more token state to `UserPreference`.

Recommended token fields:

- `id`
- `userId`
- `type`: `email_verification`, `password_reset`, `email_otp`
- `tokenHash`
- `expiresAt`
- `consumedAt`
- `attemptCount`
- `createdAt`
- `updatedAt`

Optional observability fields:

- `createdIpHash`
- `createdUserAgent`

Signup behavior:

- Signup still creates the user and household or joins via invite.
- New users are created with `emailVerifiedAt = null`.
- The server sends a verification email with a random token.
- The app should not grant normal app access until email is verified.
- The client should route unverified users to a verification pending screen.
- Verification consumes the token and sets `emailVerifiedAt`.

Login behavior:

- Password validation can succeed for unverified users, but the response should not grant normal app access.
- Recommended response: `{ requireEmailVerification: true, email }`.
- Resend verification is available and rate-limited.
- Error responses must remain enumeration-resistant where appropriate.

Invite behavior:

- Invite token proves permission to join a household, not ownership of the email inbox.
- Invited users must still verify their email before full access.

Password reset behavior:

- Move password reset tokens into the same security-token model.
- Password reset should only send mail for verified users.
- The public response remains generic: "If that email exists, a reset link has been sent."
- Resetting password invalidates refresh tokens.
- Later E2EE phases must treat login password reset and data encryption recovery as separate concerns.

### Phase 2: Generalized MFA and Email OTP

Extend MFA from TOTP-specific flow to a method-based flow.

Data model:

- Keep existing `User.totpEnabled`, `User.totpSecret`, and `User.backupCodes` initially for compatibility.
- Add `User.emailMfaEnabled Boolean @default(false)`.
- Email MFA requires `emailVerifiedAt` to be non-null.
- A later cleanup can migrate to a `UserMfaMethod` table if more methods are added.

Login response:

Current:

```ts
{ requireTotp: true, tempToken }
```

Target:

```ts
{ requireMfa: true, tempToken, methods: ["totp", "email", "backup"] }
```

Email OTP flow:

- `POST /auth/mfa/email/send` accepts the temp token.
- Server verifies temp token purpose and expiry.
- Server creates a random numeric or alphanumeric code.
- Server stores only a hash of the code.
- Server emails the code to the verified account email.
- Code expires in 5 to 10 minutes.
- Code is single-use.
- Failed attempts increment `attemptCount`.
- Too many attempts invalidates the challenge and returns a generic failure.

MFA validation flow:

- `POST /auth/mfa/verify` accepts `{ tempToken, method, code }`.
- `method = "totp"` verifies against TOTP secret.
- `method = "email"` verifies against the hashed email OTP challenge.
- `method = "backup"` verifies against hashed backup codes and consumes one code.
- On success, issue access token and refresh cookie using existing session behavior.

User settings:

- Present MFA methods separately:
  - Authenticator app: recommended.
  - Email code: easier, weaker fallback.
  - Backup codes: recovery method.
- Enabling email MFA requires recent password confirmation.
- Disabling any MFA method requires password confirmation.
- If household owner/admin resets a member's MFA, the action must be audited and should invalidate active refresh tokens for that member.

Rate limits:

- Keep auth endpoint rate limits.
- Add limits for verification resend, email OTP send, and MFA verify attempts.
- Rate limit by user id when known, email hash when user id is not known, and IP as a fallback.

### Phase 3: Field-Level Client-Side Encryption

Add client-side encryption for selected high-sensitivity fields.

Key model:

- Each household has a random household data key.
- Each authorized user has a wrapped copy of the household data key.
- The wrapping key is derived locally from a user-held secret.
- Raw household data keys are never sent to the server.
- Server stores wrapped keys, key version metadata, and encrypted field envelopes.

Recommended browser primitives:

- Use WebCrypto.
- Use AES-GCM with a 96-bit random IV for field encryption.
- Use per-field associated data that binds ciphertext to model, field, record id, household id, and key version.
- Derive wrapping keys with a strong KDF supported by the chosen implementation. PBKDF2 is available in WebCrypto; Argon2id can be considered only if an existing dependency or carefully reviewed package is approved.

Encrypted envelope shape:

```ts
type EncryptedField = {
  v: 1;
  alg: "AES-GCM";
  kid: string;
  iv: string;
  ct: string;
};
```

Initial encrypted fields:

- `Account.name`
- `Account.institution`
- `TransactionJournal.description`
- `TransactionJournal.notes`
- `Merchant.name`
- `Goal.name`
- `Goal.description`
- `Budget.name`
- `ConversationMessage.content`
- Attachment or receipt text/content where supported by storage architecture.

Fields intentionally left server-readable at first:

- `householdId`
- record ids
- timestamps
- `amountDecimal`
- date
- currency
- account/category/merchant relations
- soft-delete flags
- reconciliation/status flags
- report and budget period metadata

This leaks metadata but preserves dashboards, reports, budgets, imports, rules, reconciliation, and server-side financial calculations.

Client responsibilities:

- Unlock household encryption keys after login.
- Decrypt encrypted fields in data-fetching hooks or feature-local mapping helpers.
- Encrypt fields before create/update mutations.
- Show locked placeholders when encrypted data is unavailable.
- Keep encryption logic in focused client modules instead of scattering WebCrypto calls through pages.

Server responsibilities:

- Validate encrypted envelope shape.
- Store ciphertext as opaque data.
- Preserve household scoping and authorization.
- Never log encrypted plaintext, raw keys, OTP codes, or security tokens.
- Return ciphertext fields unchanged to authorized clients.

Migration behavior:

- Add parallel encrypted columns first where needed, such as `nameEncrypted`.
- Write new values encrypted once encryption is enabled for a household.
- During transition, clients prefer encrypted fields and fall back to plaintext fields for legacy rows.
- Provide a migration screen that re-saves selected plaintext fields as encrypted after the user unlocks their key.
- Only remove plaintext fields after a separate compatibility window.

Recovery behavior:

- E2EE requires an explicit recovery choice.
- Recommended first recovery option: user downloads or records a recovery key during setup.
- Household admin recovery can be added later by wrapping household keys for multiple verified admins.
- If a user loses the encryption secret and has no recovery path, encrypted data cannot be decrypted.
- Password reset must not imply encrypted data recovery.

## API Changes

New or revised auth endpoints:

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/resend-verification`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/mfa/email/send`
- `POST /api/v1/auth/mfa/verify`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

New encryption endpoints:

- `GET /api/v1/security/encryption/status`
- `POST /api/v1/security/encryption/setup`
- `GET /api/v1/security/encryption/wrapped-key`
- `POST /api/v1/security/encryption/rotate-key`

All new route bodies must use Zod validation at the route boundary.

## Frontend Changes

Auth pages:

- Signup should show a verification pending state after account creation.
- Login should handle `requireEmailVerification` and `requireMfa`.
- MFA screen should support TOTP, email code, and backup code modes.
- Reset password should keep generic success copy.

Settings:

- Security settings should show email verification status.
- MFA settings should separate authenticator app, email code, and backup codes.
- Encryption settings should show household encryption status, recovery state, and key rotation controls.

Encrypted data handling:

- Add a client encryption module under `client/src/lib/security` or similar.
- Add typed helpers for encrypted field envelopes.
- Add feature-local mappers where needed to keep page components thin.

## Testing Strategy

Server tests:

- Signup creates unverified user and sends verification token.
- Verify email consumes token and sets `emailVerifiedAt`.
- Expired or consumed verification tokens fail.
- Resend verification is rate-limited.
- Login for unverified user does not issue full access.
- Email OTP cannot be enabled without verified email.
- Email OTP challenge stores hashed code only.
- Email OTP verifies once and cannot be replayed.
- General MFA login works for TOTP, email OTP, and backup code.
- Password reset uses the security-token model and invalidates refresh tokens.

Client tests:

- Signup pending verification state.
- Login unverified redirect/state.
- MFA method selection and validation states.
- Encrypted field helpers round-trip using WebCrypto test setup where feasible.

E2E smoke tests:

- Register, verify email, login.
- Login with email OTP enabled.
- Login with TOTP still works.
- Encrypted household setup unlocks and displays encrypted labels.

Migration tests:

- Legacy plaintext rows still render before encryption migration.
- After migration, encrypted field is preferred over plaintext fallback.
- Locked encryption state does not crash pages.

## Security Review Checklist

- No raw verification tokens, OTP codes, refresh tokens, or encryption keys are stored.
- No secrets are logged.
- Tokens and OTPs expire and are single-use.
- MFA temp tokens have short expiry and explicit purpose.
- Email OTP send and verify endpoints are rate-limited.
- Email verification and password reset responses avoid account enumeration.
- TOTP remains available and recommended.
- Password reset invalidates refresh tokens.
- Password reset does not bypass E2EE recovery requirements.
- Encrypted fields include algorithm, key id, IV, and ciphertext metadata.
- Associated data binds ciphertext to household, record, field, and key version.
- Server-side financial queries continue to filter by `householdId` and soft-delete flags.

## Rollout Plan

1. Add security-token model and email verification.
2. Migrate password reset tokens out of `UserPreference`.
3. Add generalized MFA response and email OTP.
4. Update security settings UI.
5. Add client encryption primitives and household key metadata.
6. Encrypt one narrow vertical slice, starting with account names and transaction notes.
7. Add migration UI for existing plaintext fields.
8. Expand encrypted fields after reporting, search, import, export, and AI behavior are verified.

## Product Defaults

- Email verification is mandatory by default. Self-hosted operators can later receive an explicit environment override for local-only deployments, but the first implementation should not add that override.
- Email OTP can be the only MFA method for a user, but the UI must label authenticator app MFA as recommended.
- E2EE should use a separate encryption passphrase or generated recovery key, not silently depend only on the login password.
- Household admins cannot recover another member's encrypted access in the first E2EE milestone. Multi-admin key rewrapping is a later feature.
- AI advisor features must not receive decrypted client-side E2EE fields unless the user explicitly opts into sending that decrypted context for a specific request or feature.
