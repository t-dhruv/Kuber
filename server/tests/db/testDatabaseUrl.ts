// Resolving the test database URL is shared by three callers that run in
// separate processes — the Vitest config, the global setup, and the harness —
// so it lives here rather than being derived three times.

/**
 * The database the db-backed suite runs against.
 *
 * `TEST_DATABASE_URL` wins when set (CI points it at its service container).
 * Otherwise the name in `DATABASE_URL` gets a `_test` suffix, so running the
 * suite locally never touches the development database.
 */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.TEST_DATABASE_URL;
  if (explicit) return assertTestDatabase(explicit);

  const base = env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'The database-backed suite needs TEST_DATABASE_URL or DATABASE_URL. See tests/db/README.md.',
    );
  }

  const url = new URL(base);
  const name = url.pathname.replace(/^\//, '');
  // Idempotent: the Vitest config exports the resolved URL back into
  // DATABASE_URL for the app under test, and the harness resolves again from
  // there. Suffixing twice would point at a database nobody migrated.
  if (!name.endsWith('_test')) url.pathname = `/${name}_test`;
  return assertTestDatabase(url.toString());
}

/**
 * The suite empties every table it finds, so refuse any database whose name
 * does not end in `_test`. A misconfigured `TEST_DATABASE_URL` should fail
 * loudly rather than truncate somebody's books.
 */
function assertTestDatabase(url: string): string {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run the database-backed suite against "${name}": its name must end in "_test". ` +
        'This suite truncates every table it finds.',
    );
  }
  return url;
}
