import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.join(__dirname, '.auth');

export const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'user.json');
const CREDENTIALS_PATH = path.join(AUTH_DIR, 'credentials.json');

export interface Credentials {
  email: string;
  password: string;
  householdName: string;
}

/**
 * The one User this suite creates. The first-run spec writes these; every later
 * spec reads them. Kept on disk rather than in module state because Playwright
 * runs each spec file in its own worker process.
 */
export function writeCredentials(credentials: Credentials): void {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2));
}

export function readCredentials(): Credentials {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'No credentials on disk. The first-run spec (01-first-run) must pass before ' +
        'any spec that needs a signed-in User.',
    );
  }
  return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
}
