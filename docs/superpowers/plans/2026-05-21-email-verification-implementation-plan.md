# Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mandatory email verification and replace password-reset token storage in `UserPreference` with a dedicated hashed security-token model.

**Architecture:** The backend gets a dedicated `SecurityToken` table and focused helper module for creating, consuming, and deleting hashed auth tokens. Signup creates an unverified account, sends a verification link, and returns a pending-verification response instead of full app auth. Login blocks unverified users from receiving access/refresh tokens and supports resend/verify flows from the client.

**Tech Stack:** Node.js, Express, TypeScript, Prisma 5, PostgreSQL, Zod, Nodemailer/Resend mail helper, React 18, TanStack Query, Vitest.

---

## Scope

This plan implements Phase 1 from `docs/superpowers/specs/2026-05-21-security-foundation-e2ee-design.md`.

Included:

- Add `User.emailVerifiedAt`.
- Add a dedicated `SecurityToken` model for email verification and password reset.
- Send email verification on signup.
- Verify email by token.
- Resend verification email with enumeration-resistant response behavior.
- Block full login for unverified accounts.
- Migrate password reset to `SecurityToken`.
- Add client pages and hooks for verification pending and verification callback flows.
- Update `AUDITOR.md`.

Excluded from this first plan:

- Email OTP MFA.
- Generalized MFA method response.
- Field-level E2EE.
- Existing-user bulk backfill policy beyond migration default.

## File Structure

- Modify `server/prisma/schema.prisma`
  - Add `User.emailVerifiedAt`.
  - Add `User.securityTokens`.
  - Add `SecurityToken` model.
- Create migration under `server/prisma/migrations/<timestamp>_add_email_verification_security_tokens/migration.sql`
  - Add `emailVerifiedAt` column.
  - Create `security_tokens` table and indexes.
- Create `server/src/lib/securityTokens.ts`
  - Encapsulate hashed token creation, verification, consumption, and deletion.
- Modify `server/src/lib/email.ts`
  - Add `sendEmailVerificationEmail`.
- Modify `server/src/routeModules/auth.ts`
  - Add Zod schemas for touched auth routes.
  - Change signup response.
  - Add verify/resend endpoints.
  - Block login for unverified users.
  - Move password reset to `SecurityToken`.
- Modify `server/src/test-setup.ts`
  - Add `securityToken` mock delegate.
- Create `server/src/routeModules/auth.emailVerification.test.ts`
  - Add route-level tests for signup, login block, verify, resend, and password reset token migration.
- Modify `client/src/hooks/useAuth.ts`
  - Add typed pending verification response.
  - Add verify/resend hooks.
- Modify `client/src/pages/SignupPage.tsx`
  - Show pending verification state after signup.
- Create `client/src/pages/VerifyEmailPage.tsx`
  - Consume token from query string and show success/error state.
- Modify `client/src/pages/LoginPage.tsx`
  - Handle `requireEmailVerification`.
- Modify `client/src/App.tsx`
  - Add `/verify-email` route.
- Modify `AUDITOR.md`
  - Track completed implementation and verification commands.

## Task 1: Add Prisma Security State

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260521120000_add_email_verification_security_tokens/migration.sql`

- [ ] **Step 1: Run GitNexus impact analysis before editing schema-adjacent auth symbols**

Run:

```bash
rtk npx gitnexus impact --target User --direction upstream
```

If CLI is unavailable, use the GitNexus MCP impact tool with:

```json
{"repo":"Kuber","target":"User","direction":"upstream","maxDepth":2}
```

Expected: direct impact includes auth/settings/user DTO areas. If risk is HIGH or CRITICAL, stop and report the risk before editing.

- [ ] **Step 2: Update `User` in `server/prisma/schema.prisma`**

Add `emailVerifiedAt` near the email/password fields and add the relation near token relations:

```prisma
model User {
  id                  String            @id @default(cuid())
  email               String            @unique
  emailVerifiedAt     DateTime?
  passwordHash        String
  firstName           String
  lastName            String
  avatar              String?
  timezone            String            @default("America/New_York")
  theme               String            @default("system")
  // 2FA
  totpSecret          String?
  totpEnabled         Boolean           @default(false)
  backupCodes         String[]          @default([])
  // Account lockout
  failedLoginAttempts Int               @default(0)
  lockedUntil         DateTime?
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  householdMembers    HouseholdMember[]
  preferences         UserPreference[]
  refreshTokens       RefreshToken[]
  securityTokens      SecurityToken[]
  auditLogs           AuditLog[]
  apiTokens           ApiToken[]

  @@map("users")
}
```

- [ ] **Step 3: Add `SecurityToken` model after `RefreshToken`**

```prisma
model SecurityToken {
  id           String    @id @default(cuid())
  userId       String
  type         String
  tokenHash    String    @unique
  expiresAt    DateTime
  consumedAt   DateTime?
  attemptCount Int       @default(0)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, type])
  @@index([expiresAt])
  @@map("security_tokens")
}
```

- [ ] **Step 4: Create migration SQL**

Create `server/prisma/migrations/20260521120000_add_email_verification_security_tokens/migration.sql`:

```sql
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE TABLE "security_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "security_tokens_tokenHash_key" ON "security_tokens"("tokenHash");
CREATE INDEX "security_tokens_userId_type_idx" ON "security_tokens"("userId", "type");
CREATE INDEX "security_tokens_expiresAt_idx" ON "security_tokens"("expiresAt");

ALTER TABLE "security_tokens"
  ADD CONSTRAINT "security_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 5: Format and generate Prisma client**

Run:

```bash
rtk npx prisma format --schema server/prisma/schema.prisma
rtk npm run db:generate --workspace=server
```

Expected: both commands pass.

- [ ] **Step 6: Commit schema changes**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260521120000_add_email_verification_security_tokens/migration.sql package-lock.json
git commit -m "feat: add email verification security token schema"
```

## Task 2: Add Security Token Helper

**Files:**
- Create: `server/src/lib/securityTokens.ts`
- Modify: `server/src/test-setup.ts`
- Test: `server/src/lib/securityTokens.test.ts`

- [ ] **Step 1: Write helper tests**

Create `server/src/lib/securityTokens.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock } from '../test-setup';
import {
  consumeSecurityToken,
  createSecurityToken,
  deleteSecurityTokensForUser,
  SECURITY_TOKEN_TTLS,
} from './securityTokens';
import { hashToken } from './token';

describe('securityTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
  });

  it('stores only the hashed token', async () => {
    prismaMock.securityToken.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.securityToken.create.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      type: 'email_verification',
      tokenHash: 'hash',
      expiresAt: new Date(),
      consumedAt: null,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await createSecurityToken('user_1', 'email_verification');

    expect(result.rawToken).toMatch(/^[a-f0-9]{80}$/);
    expect(prismaMock.securityToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        type: 'email_verification',
        tokenHash: hashToken(result.rawToken),
      }),
    });
  });

  it('consumes a valid token once', async () => {
    const tokenHash = hashToken('raw-token');
    prismaMock.securityToken.findUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      type: 'email_verification',
      tokenHash,
      expiresAt: new Date(Date.now() + SECURITY_TOKEN_TTLS.email_verification),
      consumedAt: null,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.securityToken.update.mockResolvedValue({} as never);

    const result = await consumeSecurityToken('raw-token', 'email_verification');

    expect(result.ok).toBe(true);
    expect(result.userId).toBe('user_1');
    expect(prismaMock.securityToken.update).toHaveBeenCalledWith({
      where: { id: 'tok_1' },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it('rejects expired tokens and increments attempts', async () => {
    prismaMock.securityToken.findUnique.mockResolvedValue({
      id: 'tok_1',
      userId: 'user_1',
      type: 'email_verification',
      tokenHash: hashToken('raw-token'),
      expiresAt: new Date(Date.now() - 1),
      consumedAt: null,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.securityToken.update.mockResolvedValue({} as never);

    const result = await consumeSecurityToken('raw-token', 'email_verification');

    expect(result).toEqual({ ok: false, reason: 'expired' });
    expect(prismaMock.securityToken.update).toHaveBeenCalledWith({
      where: { id: 'tok_1' },
      data: { attemptCount: { increment: 1 } },
    });
  });

  it('deletes outstanding tokens for a user and type', async () => {
    prismaMock.securityToken.deleteMany.mockResolvedValue({ count: 2 });

    await deleteSecurityTokensForUser('user_1', 'password_reset');

    expect(prismaMock.securityToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user_1', type: 'password_reset', consumedAt: null },
    });
  });
});
```

- [ ] **Step 2: Update test setup mock**

In `server/src/test-setup.ts`, add this delegate to `mockPrismaClient`:

```ts
  securityToken: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
```

- [ ] **Step 3: Run helper test and verify it fails**

Run:

```bash
rtk npm run test --workspace=server -- src/lib/securityTokens.test.ts
```

Expected: fail because `server/src/lib/securityTokens.ts` does not exist.

- [ ] **Step 4: Create `server/src/lib/securityTokens.ts`**

```ts
import { prisma } from './prisma';
import { generateRawToken, hashToken } from './token';

export const SECURITY_TOKEN_TTLS = {
  email_verification: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
  email_otp: 10 * 60 * 1000,
} as const;

export type SecurityTokenType = keyof typeof SECURITY_TOKEN_TTLS;

type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'missing' | 'wrong_type' | 'expired' | 'consumed' };

export async function createSecurityToken(userId: string, type: SecurityTokenType): Promise<{ rawToken: string; expiresAt: Date }> {
  await deleteSecurityTokensForUser(userId, type);

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SECURITY_TOKEN_TTLS[type]);

  await prisma.securityToken.create({
    data: {
      userId,
      type,
      tokenHash,
      expiresAt,
    },
  });

  return { rawToken, expiresAt };
}

export async function consumeSecurityToken(rawToken: string, expectedType: SecurityTokenType): Promise<ConsumeResult> {
  const tokenHash = hashToken(rawToken);
  const token = await prisma.securityToken.findUnique({ where: { tokenHash } });

  if (!token) return { ok: false, reason: 'missing' };
  if (token.type !== expectedType) return { ok: false, reason: 'wrong_type' };
  if (token.consumedAt) return { ok: false, reason: 'consumed' };

  if (token.expiresAt <= new Date()) {
    await prisma.securityToken.update({
      where: { id: token.id },
      data: { attemptCount: { increment: 1 } },
    });
    return { ok: false, reason: 'expired' };
  }

  await prisma.securityToken.update({
    where: { id: token.id },
    data: { consumedAt: new Date() },
  });

  return { ok: true, userId: token.userId };
}

export async function deleteSecurityTokensForUser(userId: string, type: SecurityTokenType): Promise<void> {
  await prisma.securityToken.deleteMany({
    where: { userId, type, consumedAt: null },
  });
}
```

- [ ] **Step 5: Run helper test and verify it passes**

Run:

```bash
rtk npm run test --workspace=server -- src/lib/securityTokens.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit helper**

```bash
git add server/src/lib/securityTokens.ts server/src/lib/securityTokens.test.ts server/src/test-setup.ts
git commit -m "feat: add hashed security token helper"
```

## Task 3: Add Verification Email Template

**Files:**
- Modify: `server/src/lib/email.ts`

- [ ] **Step 1: Run GitNexus impact analysis**

Run MCP impact:

```json
{"repo":"Kuber","target":"sendMail","direction":"upstream","file_path":"server/src/lib/email.ts","maxDepth":2}
```

Expected: mail senders and notification/reporting flows. If risk is HIGH or CRITICAL, report before editing.

- [ ] **Step 2: Add `sendEmailVerificationEmail` below `sendPasswordResetEmail`**

```ts
export async function sendEmailVerificationEmail(to: string, token: string) {
  const url = `${CLIENT_URL}/verify-email?token=${token}`;
  await sendMail({
    to,
    subject: 'Verify your Kuber email',
    text: `Verify your email: ${url}\n\nThis link expires in 24 hours. If you didn't create a Kuber account, ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2>Verify your email</h2>
        <p>Confirm this email address to finish setting up your Kuber account. This link expires in 24 hours.</p>
        <a href="${url}" style="display:inline-block;padding:10px 20px;background:#E5622A;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Verify Email</a>
        <p style="color:#888;font-size:12px;margin-top:24px">If you didn't create a Kuber account, you can safely ignore this email.</p>
      </div>`,
  });
}
```

- [ ] **Step 3: Commit email helper**

```bash
git add server/src/lib/email.ts
git commit -m "feat: add email verification message"
```

## Task 4: Update Auth Route for Verification and Reset Tokens

**Files:**
- Modify: `server/src/routeModules/auth.ts`
- Test: `server/src/routeModules/auth.emailVerification.test.ts`

- [ ] **Step 1: Run GitNexus impact analysis for auth route**

Run MCP impact:

```json
{"repo":"Kuber","target":"signAccessToken","direction":"upstream","file_path":"server/src/routeModules/auth.ts","maxDepth":2}
```

Also run:

```json
{"repo":"Kuber","target":"toUserDto","direction":"upstream","file_path":"server/src/routeModules/auth.ts","maxDepth":2}
```

Expected: auth login/signup/2FA/me flows. If HIGH or CRITICAL, report before editing.

- [ ] **Step 2: Add imports**

In `server/src/routeModules/auth.ts`, extend imports:

```ts
import { z } from 'zod';
import {
  consumeSecurityToken,
  createSecurityToken,
} from '../lib/securityTokens';
import { sendPasswordResetEmail, sendAccountLockoutEmail, sendWelcomeEmail, sendEmailVerificationEmail } from '../lib/email';
```

Remove `crypto` import if it is only used for password reset tokens after this task.

- [ ] **Step 3: Add Zod schemas near constants**

```ts
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  householdName: z.string().min(1).optional(),
  inviteToken: z.string().min(1).optional(),
}).refine((data) => data.householdName || data.inviteToken, {
  message: 'All fields are required',
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

const tokenSchema = z.object({
  token: z.string().min(1),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});
```

- [ ] **Step 4: Change signup body parsing**

Replace manual destructuring at the start of `/signup` with:

```ts
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid signup request' });
    }

    const { email, password, firstName, lastName, householdName, inviteToken } = parsed.data;
```

- [ ] **Step 5: Set new users unverified and send verification email**

Inside the signup transaction, keep user creation with `emailVerifiedAt` omitted. After the transaction, replace token issuance and response with:

```ts
    const { rawToken } = await createSecurityToken(result.user.id, 'email_verification');

    sendEmailVerificationEmail(result.user.email, rawToken).catch(() => {});
    sendWelcomeEmail(result.user.email, result.user.firstName).catch(() => {});

    return res.status(201).json({
      requireEmailVerification: true,
      email: result.user.email,
      message: 'Check your email to verify your account.',
    });
```

Remove the access-token creation, refresh-token creation, `setRefreshCookie`, and `{ user, accessToken }` response from signup.

- [ ] **Step 6: Add verify email endpoint before `/login`**

```ts
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const parsed = tokenSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Verification token is required' });

    const result = await consumeSecurityToken(parsed.data.token, 'email_verification');
    if (!result.ok) return res.status(400).json({ error: 'Invalid or expired verification token' });

    await prisma.user.update({
      where: { id: result.userId },
      data: { emailVerifiedAt: new Date() },
    });

    return res.json({ message: 'Email verified successfully' });
  } catch (err) {
    log.error({ err }, 'auth/verify-email');
    return res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 7: Add resend verification endpoint before `/login`**

```ts
router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.json({ message: 'If that email needs verification, a new link has been sent.' });
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (user && !user.emailVerifiedAt) {
      const { rawToken } = await createSecurityToken(user.id, 'email_verification');
      await sendEmailVerificationEmail(user.email, rawToken);
    }

    return res.json({ message: 'If that email needs verification, a new link has been sent.' });
  } catch (err) {
    log.error({ err }, 'auth/resend-verification');
    return res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 8: Change login parsing and block unverified users**

At the start of `/login`, replace manual parsing with:

```ts
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Email and password are required' });

    const { email, password, rememberMe = false } = parsed.data;
```

After password validity succeeds and before household lookup, add:

```ts
    if (!user.emailVerifiedAt) {
      return res.status(403).json({
        requireEmailVerification: true,
        email: user.email,
        error: 'Verify your email before signing in.',
      });
    }
```

- [ ] **Step 9: Move forgot password to `SecurityToken`**

Replace `/forgot-password` body parsing and token creation with:

```ts
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Email is required' });

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });

    if (user?.emailVerifiedAt) {
      const { rawToken } = await createSecurityToken(user.id, 'password_reset');
      await sendPasswordResetEmail(user.email, rawToken);
    }
```

Keep the same generic success response.

- [ ] **Step 10: Move reset password to `SecurityToken`**

Replace `/reset-password` body parsing and `UserPreference` token lookup with:

```ts
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Token and password are required' });
    }

    const { token, password } = parsed.data;
    const consumed = await consumeSecurityToken(token, 'password_reset');
    if (!consumed.ok) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: consumed.userId },
        data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: consumed.userId } }),
    ]);
```

Keep response:

```ts
return res.json({ message: 'Password updated successfully' });
```

- [ ] **Step 11: Add route tests**

Create `server/src/routeModules/auth.emailVerification.test.ts` with tests that mount `authRouter` on a local Express app, mock email senders, and verify:

```ts
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock } from '../test-setup';
import authRouter from './auth';

vi.mock('../lib/email', () => ({
  sendEmailVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendAccountLockoutEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));

function app() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

describe('auth email verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') return arg(prismaMock);
      return Promise.all(arg as Promise<unknown>[]);
    });
  });

  it('signup returns pending email verification instead of access token', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: 'user_1',
      email: 'new@example.com',
      firstName: 'New',
      lastName: 'User',
      avatar: null,
      timezone: 'America/New_York',
      theme: 'system',
    });
    prismaMock.household.create.mockResolvedValue({ id: 'household_1' });
    prismaMock.householdMember.create.mockResolvedValue({});
    prismaMock.category.create.mockResolvedValue({});
    prismaMock.securityToken.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.securityToken.create.mockResolvedValue({});

    const res = await request(app()).post('/auth/signup').send({
      email: 'new@example.com',
      password: 'Password123!',
      firstName: 'New',
      lastName: 'User',
      householdName: 'New Household',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      requireEmailVerification: true,
      email: 'new@example.com',
    });
    expect(res.body.accessToken).toBeUndefined();
  });

  it('login blocks unverified users after valid password', async () => {
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash('Password123!', 12);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user_1',
      email: 'new@example.com',
      emailVerifiedAt: null,
      passwordHash,
      failedLoginAttempts: 0,
      lockedUntil: null,
      householdMembers: [{ householdId: 'household_1' }],
    });

    const res = await request(app()).post('/auth/login').send({
      email: 'new@example.com',
      password: 'Password123!',
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      requireEmailVerification: true,
      email: 'new@example.com',
    });
  });
});
```

If default-category seeding makes the signup test brittle, keep the route tests focused on login block, verify, resend, forgot password, and reset password, then cover signup response manually through browser/API after implementation.

- [ ] **Step 12: Run route tests**

Run:

```bash
rtk npm run test --workspace=server -- src/routeModules/auth.emailVerification.test.ts
```

Expected: pass after route changes.

- [ ] **Step 13: Commit auth route changes**

```bash
git add server/src/routeModules/auth.ts server/src/routeModules/auth.emailVerification.test.ts
git commit -m "feat: require email verification for auth"
```

## Task 5: Add Client Verification Flow

**Files:**
- Modify: `client/src/hooks/useAuth.ts`
- Modify: `client/src/pages/SignupPage.tsx`
- Modify: `client/src/pages/LoginPage.tsx`
- Create: `client/src/pages/VerifyEmailPage.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Run GitNexus impact analysis before editing auth hooks/pages**

Run MCP impact:

```json
{"repo":"Kuber","target":"useSignup","direction":"upstream","file_path":"client/src/hooks/useAuth.ts","maxDepth":2}
```

Run MCP impact:

```json
{"repo":"Kuber","target":"LoginPage","direction":"upstream","file_path":"client/src/pages/LoginPage.tsx","maxDepth":2}
```

Expected: auth pages only. If HIGH or CRITICAL, report before editing.

- [ ] **Step 2: Update auth hook types and add verification hooks**

In `client/src/hooks/useAuth.ts`, add:

```ts
type SignupResponse = {
  requireEmailVerification: true;
  email: string;
  message: string;
};

type EmailVerificationResponse = {
  message: string;
};
```

Change `useSignup` to:

```ts
export function useSignup() {
  return useMutation({
    mutationFn: (data: { email: string; password: string; firstName: string; lastName: string; householdName?: string; inviteToken?: string }) =>
      api.post<SignupResponse>('/auth/signup', data).then(r => r.data),
  });
}
```

Add:

```ts
export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) =>
      api.post<EmailVerificationResponse>('/auth/verify-email', { token }).then(r => r.data),
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) =>
      api.post<EmailVerificationResponse>('/auth/resend-verification', { email }).then(r => r.data),
  });
}
```

- [ ] **Step 3: Update `SignupPage` pending state**

Add state:

```ts
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
```

Change `signup.mutate(...)` to:

```ts
    signup.mutate(
      {
        email,
        password,
        firstName,
        lastName,
        householdName: inviteToken ? undefined : householdName,
        inviteToken,
      },
      {
        onSuccess: (data) => setPendingVerificationEmail(data.email),
      },
    );
```

Before the form return body, add:

```tsx
  if (pendingVerificationEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-4">
        <div className="w-full max-w-[440px] bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-10">
          <h1 className="text-[2rem] font-extrabold text-[var(--color-accent)] m-0">Check your email</h1>
          <p className="text-[var(--color-text-secondary)] mt-4 text-sm">
            We sent a verification link to {pendingVerificationEmail}. Verify your email before signing in.
          </p>
          <Link to="/login" className="inline-flex mt-6 text-[var(--color-accent)] no-underline font-medium">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }
```

- [ ] **Step 4: Create `VerifyEmailPage`**

Create `client/src/pages/VerifyEmailPage.tsx`:

```tsx
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
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-4">
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
```

- [ ] **Step 5: Add route in `App.tsx`**

Add lazy import:

```ts
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmailPage'));
```

Add public route:

```tsx
      <Route
        path="/verify-email"
        element={
          <Suspense fallback={<PageLoader />}>
            <VerifyEmailPage />
          </Suspense>
        }
      />
```

- [ ] **Step 6: Update `LoginPage` handling**

Because `client/src/pages/LoginPage.tsx` currently has an unrelated unstaged change, inspect the current working copy before editing and preserve the user's changes.

Add state in `LoginPage`:

```ts
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
```

When calling `login.mutate`, pass `onError` that checks for `requireEmailVerification`:

```ts
      onError: (err) => {
        const data = (err as { response?: { data?: { requireEmailVerification?: boolean; email?: string } } }).response?.data;
        if (data?.requireEmailVerification && data.email) {
          setUnverifiedEmail(data.email);
        }
      },
```

Render a small panel above the form when `unverifiedEmail` exists:

```tsx
      {unverifiedEmail && (
        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--color-accent-light)] text-[var(--color-text)] text-sm mb-4">
          Verify {unverifiedEmail} before signing in. Use the link we sent to your inbox.
        </div>
      )}
```

- [ ] **Step 7: Run client typecheck/build**

Run:

```bash
rtk npm run build --workspace=@kuber/client
```

Expected: pass.

- [ ] **Step 8: Commit client flow**

```bash
git add client/src/hooks/useAuth.ts client/src/pages/SignupPage.tsx client/src/pages/VerifyEmailPage.tsx client/src/pages/LoginPage.tsx client/src/App.tsx
git commit -m "feat: add email verification client flow"
```

## Task 6: Verify, Audit, and Finalize Phase 1

**Files:**
- Modify: `AUDITOR.md`

- [ ] **Step 1: Run focused server tests**

```bash
rtk npm run test --workspace=server -- src/lib/securityTokens.test.ts src/routeModules/auth.emailVerification.test.ts
```

Expected: pass.

- [ ] **Step 2: Run broader verification**

```bash
rtk npm run build
rtk npm run test
```

Expected: pass, except pre-existing unrelated failures must be documented with exact command and failure summary.

- [ ] **Step 3: Run GitNexus change detection**

Use MCP:

```json
{"repo":"Kuber","scope":"all"}
```

Expected changed scope:

- Prisma schema and migration.
- Auth route module.
- Email helper.
- Security token helper and tests.
- Auth hooks/pages.
- `AUDITOR.md`.

If unexpected unrelated symbols appear, inspect before committing.

- [ ] **Step 4: Update `AUDITOR.md`**

Add a dated entry under `Latest Verification`:

```md
- 2026-05-21: Implemented Phase 1 email verification foundation: `User.emailVerifiedAt`, hashed `SecurityToken` storage for email verification/password reset, verification/resend auth endpoints, unverified-login block, and client verification flow. Verification run: `rtk npm run test --workspace=server -- src/lib/securityTokens.test.ts src/routeModules/auth.emailVerification.test.ts`, `rtk npm run build`, `rtk npm run test`.
```

Update the `Security/auth roadmap` debt line to:

```md
- **Security/auth roadmap:** Email verification is implemented. Email OTP MFA, generalized MFA responses, and field-level client-side encryption remain open. Design is tracked in `docs/superpowers/specs/2026-05-21-security-foundation-e2ee-design.md`.
```

- [ ] **Step 5: Commit final audit update**

```bash
git add AUDITOR.md
git commit -m "docs: record email verification implementation"
```

## Self-Review

Spec coverage:

- Email verification: covered by Tasks 1, 3, 4, and 5.
- Dedicated token model: covered by Tasks 1, 2, and 4.
- Password reset token migration: covered by Task 4.
- Client verification pending/callback UX: covered by Task 5.
- Verification commands and audit tracking: covered by Task 6.
- Email OTP MFA and E2EE: intentionally excluded because they depend on this foundation and should be separate implementation plans.

Placeholder scan:

- No placeholder markers.
- No deferred code-comment work items.
- Every code-changing task includes concrete target files and snippets.

Type consistency:

- Token type names are consistent: `email_verification`, `password_reset`, `email_otp`.
- Client and server signup response uses `requireEmailVerification`, `email`, and `message`.
- Login blocked response uses `requireEmailVerification`, `email`, and `error`.
