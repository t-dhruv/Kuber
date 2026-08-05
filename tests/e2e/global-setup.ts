import { FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:9001';
const AUTH_DIR = path.join(__dirname, '.auth');

/**
 * Global setup deliberately does *not* create a User.
 *
 * On a default Instance, open registration closes as soon as the first
 * Household exists (see `isOpenSignupAllowed`). There is therefore exactly one
 * signup available against a fresh stack, and it belongs to the first-run spec
 * — that signup is the behaviour under test, not a fixture. Spending it here
 * would mean the first-run path is exercised by setup code whose failure mode
 * is a confusing timeout rather than a red test.
 *
 * So this only does what setup can honestly own: clear any state left by a
 * previous run, and wait for the Instance to answer.
 */
export default async function globalSetup(_config: FullConfig) {
  fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const deadline = Date.now() + 120_000;
  let lastError = '';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/health`);
      if (response.ok) {
        console.log(`[global-setup] Instance reachable at ${BASE_URL}`);
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(
    `Instance at ${BASE_URL} did not become reachable within 120s. Last error: ${lastError}`,
  );
}
