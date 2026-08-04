import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { encrypt } from '../../src/lib/encryption';
import { createHousehold, createTestApp, prisma, resetDatabase } from './harness';

// ADR-0003. A fresh Instance used to brick itself: signup always issued an
// email-verification token, login refused unverified Users, and both email
// providers are optional and configured from Settings — that is, after login. So
// the first User was told to check an inbox that would never receive anything,
// and login returned 403 forever. The only recovery was editing the database.
//
// Proving this needs the real thing. Whether a provider is configured is a
// question about a database row and the environment, and whether login then
// succeeds is a question about a row written by a previous request — neither
// survives a mocked Prisma that returns whatever it is told.

const ENV_KEYS = ['ALLOW_SIGNUP', 'RESEND_API_KEY', 'RESEND_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const;
const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const [key, value] of originalEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(async () => {
  await resetDatabase();
  for (const key of ENV_KEYS) delete process.env[key];
});

function signupBody(overrides: Record<string, unknown> = {}) {
  return {
    email: `new-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'correct-horse-battery-staple',
    firstName: 'New',
    lastName: 'Owner',
    householdName: 'The Books',
    ...overrides,
  };
}

describe('signing up on an Instance with no email provider', () => {
  it('signs the new Owner straight in rather than waiting on an unsendable email', async () => {
    const app = createTestApp();
    const body = signupBody();

    const res = await request(app).post('/api/v1/auth/signup').send(body);

    expect(res.status).toBe(201);
    expect(res.body.requireEmailVerification).toBe(false);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe(body.email.toLowerCase());

    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    expect(user?.emailVerifiedAt).not.toBeNull();
  });

  it('lets that Owner log in immediately afterwards', async () => {
    const app = createTestApp();
    const body = signupBody();
    await request(app).post('/api/v1/auth/signup').send(body).expect(201);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: body.email, password: body.password });

    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
  });

  it('issues no verification token, since nothing could deliver it', async () => {
    const app = createTestApp();
    const body = signupBody();
    await request(app).post('/api/v1/auth/signup').send(body).expect(201);

    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    const tokens = await prisma.securityToken.count({
      where: { userId: user!.id, type: 'email_verification' },
    });
    expect(tokens).toBe(0);
  });
});

describe('signing up on an Instance with an email provider configured', () => {
  it('still requires verification before the User can log in', async () => {
    process.env.RESEND_API_KEY = 'test-resend-key';
    const app = createTestApp();
    const body = signupBody();

    const res = await request(app).post('/api/v1/auth/signup').send(body);

    expect(res.status).toBe(201);
    expect(res.body.requireEmailVerification).toBe(true);
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.email).toBe(body.email.toLowerCase());

    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    expect(user?.emailVerifiedAt).toBeNull();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: body.email, password: body.password });
    expect(login.status).toBe(403);
    expect(login.body.requireEmailVerification).toBe(true);
  });

  it('honours a provider configured in the database, not only in the environment', async () => {
    // This is the path a Self-hoster actually takes: they configure email from
    // Settings after first login, and every later signup must then verify.
    await prisma.emailConfig.create({
      // smtpPass is stored encrypted and decrypted on read; the value only has
      // to survive that round trip. The assertion is on the verification
      // decision, never on the credential.
      data: {
        id: 'singleton',
        provider: 'smtp',
        smtpHost: 'smtp.example.test',
        smtpUser: 'kuber',
        smtpPass: encrypt('unused-password'),
      },
    });
    const app = createTestApp();
    const body = signupBody();

    const res = await request(app).post('/api/v1/auth/signup').send(body);

    expect(res.status).toBe(201);
    expect(res.body.requireEmailVerification).toBe(true);
  });
});

describe('open registration closes once the first Household exists', () => {
  it('accepts the very first signup on an empty Instance', async () => {
    const res = await request(createTestApp()).post('/api/v1/auth/signup').send(signupBody());
    expect(res.status).toBe(201);
  });

  it('rejects a later uninvited signup with a message that says what to do', async () => {
    await createHousehold();

    const res = await request(createTestApp()).post('/api/v1/auth/signup').send(signupBody());

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/registration is closed/i);
    expect(res.body.error).toMatch(/invite/i);
  });

  it('answers the same way whether or not the address is already registered', async () => {
    // Otherwise a closed Instance is an unauthenticated oracle over its own
    // Users: 409 "email already in use" for a registered address, 403 for an
    // unknown one, to anyone who can reach the signup endpoint.
    const existing = await createHousehold();

    const known = await request(createTestApp())
      .post('/api/v1/auth/signup')
      .send(signupBody({ email: existing.user.email }));
    const unknown = await request(createTestApp()).post('/api/v1/auth/signup').send(signupBody());

    expect(known.status).toBe(403);
    expect(unknown.status).toBe(403);
    expect(known.body).toEqual(unknown.body);
  });

  it('reopens when ALLOW_SIGNUP is deliberately enabled', async () => {
    await createHousehold();
    process.env.ALLOW_SIGNUP = 'true';

    const res = await request(createTestApp()).post('/api/v1/auth/signup').send(signupBody());

    expect(res.status).toBe(201);
  });

  it('stays closed when ALLOW_SIGNUP is explicitly disabled', async () => {
    await createHousehold();
    process.env.ALLOW_SIGNUP = 'false';

    const res = await request(createTestApp()).post('/api/v1/auth/signup').send(signupBody());

    expect(res.status).toBe(403);
  });

  it('accepts an invited signup regardless of the registration setting', async () => {
    const owner = await createHousehold();
    process.env.ALLOW_SIGNUP = 'false';
    const email = `invited-${Date.now()}@example.test`;
    const invite = await prisma.householdInvite.create({
      data: {
        householdId: owner.household.id,
        email,
        role: 'member',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const res = await request(createTestApp())
      .post('/api/v1/auth/signup')
      .send(signupBody({ email, householdName: undefined, inviteToken: invite.token }));

    expect(res.status).toBe(201);
    const membership = await prisma.householdMember.findFirst({
      where: { user: { email }, householdId: owner.household.id },
    });
    expect(membership).not.toBeNull();
  });
});
