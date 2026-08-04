import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { migrationsDir, prisma, testDatabaseUrl } from './harness';

// The only path a new Self-hoster ever takes is "empty database, apply every
// migration in order". Seventy-eight migrations have accumulated, including
// destructive steps, and that replay has never been verified. The global setup
// performs the replay against a freshly emptied schema; these tests assert it
// landed where the Prisma datamodel says it should.

type AppliedMigration = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  applied_steps_count: number;
};

function migrationDirectoryNames(): string[] {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe('migration history', () => {
  it('applies every migration to a fresh, empty database', async () => {
    const applied = await prisma.$queryRawUnsafe<AppliedMigration[]>(
      'SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM _prisma_migrations',
    );

    // Sorted in JS on both sides: Postgres orders underscores differently under
    // the C and libc collations, so ORDER BY here would compare a libc-sorted
    // list against a JS-sorted one and fail on some runners but not others.
    const appliedNames = applied.map((row) => row.migration_name).sort();

    expect(appliedNames).toEqual(migrationDirectoryNames());
  });

  it('records no failed or rolled-back migration', async () => {
    const broken = await prisma.$queryRawUnsafe<AppliedMigration[]>(
      'SELECT migration_name, finished_at, rolled_back_at, applied_steps_count FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL',
    );

    expect(broken).toEqual([]);
  });

  it('leaves no drift between the migrated schema and the datamodel', () => {
    // `migrate diff --exit-code` exits 2 when the two differ. Comparing the
    // live database against schema.prisma catches the case where a migration
    // was hand-edited or a schema change shipped without one — a fresh
    // Instance would then get a schema no test ever exercised.
    let drift: string | null = null;
    try {
      execFileSync(
        'npx',
        [
          'prisma',
          'migrate',
          'diff',
          '--from-url',
          testDatabaseUrl,
          '--to-schema-datamodel',
          join(migrationsDir, '..', 'schema.prisma'),
          '--exit-code',
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    } catch (err) {
      // Report what actually differs. `--exit-code` exits 2 on a difference and
      // prints the migration that would close it — the one thing a maintainer
      // needs, and the thing a bare "expected not to throw" would swallow.
      const { stdout, stderr } = err as { stdout?: string; stderr?: string };
      drift = `${stdout ?? ''}${stderr ?? ''}`.trim();
    }

    expect(drift).toBeNull();
  });
});
