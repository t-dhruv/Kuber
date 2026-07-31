import { chromium, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:9001';
const AUTH_DIR = path.join(__dirname, '.auth');
const STATE_PATH = path.join(AUTH_DIR, 'user.json');
const CREDS_PATH = path.join(AUTH_DIR, 'credentials.json');

async function markEmailVerified(email: string): Promise<void> {
  // Imported lazily so the Prisma client is only required when setup runs.
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await prisma.user.update({
      where: { email },
      data: { emailVerifiedAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export default async function globalSetup(_config: FullConfig) {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const ts = Date.now();
  const email = `e2e+${ts}@kuber.test`;
  const password = 'E2E-Password123!';

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/signup`);
  await page.locator('input[name="firstName"], #firstName').fill('E2E');
  await page.locator('input[name="lastName"], #lastName').fill('User');
  await page.locator('input[name="email"], #email').fill(email);
  await page.locator('input[name="password"], #password').fill(password);

  const confirmPassword = page.locator('input[name="confirmPassword"], #confirmPassword');
  if (await confirmPassword.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmPassword.fill(password);
  }
  const householdInput = page.locator('input[name="householdName"], #householdName');
  if (await householdInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await householdInput.fill('E2E Household');
  }

  await page.getByRole('button', { name: /sign up|create account/i }).click();

  // Signup returns { requireEmailVerification: true } and no tokens, so the
  // page stays on /signup and renders a "Check your email" view rather than
  // navigating. Wait for that view to confirm the account was created.
  await page.getByRole('heading', { name: /check your email/i }).waitFor({ timeout: 20_000 });

  // Login is blocked until the address is verified, and the verification token
  // is only ever emailed and is stored hashed, so a browser-only flow cannot
  // complete it. Mark the address verified directly — this is test setup
  // standing in for the user clicking the link in their inbox.
  await markEmailVerified(email);

  await page.goto(`${BASE_URL}/login`);
  await page.locator('input[name="email"], #email').fill(email);
  await page.locator('input[name="password"], #password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });

  await page.evaluate(() => localStorage.setItem('kuber-onboarding-done', '1'));

  fs.writeFileSync(CREDS_PATH, JSON.stringify({ email, password }));
  await context.storageState({ path: STATE_PATH });
  await browser.close();

  console.log(`[global-setup] Created test user: ${email}`);
}
