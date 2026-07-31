# Plan 020: Make the release gate measure what it claims to measure

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 66c013c..HEAD -- scripts/ server/vitest.config.ts client/vitest.config.ts docs/FEATURE_COVERAGE_MATRIX.md .githooks/pre-push package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `66c013c`, 2026-07-27

## Why this matters

Kuber has a release gate (`make release-gate` → `npm run qa:release-gate`) that
reports "90% code coverage, 100% feature coverage" and blocks pushes via a
pre-push hook. Both numbers are currently much weaker than they read:

1. **The server 90% threshold applies to 25 hand-listed files out of 154.**
   `server/vitest.config.ts` sets `coverage.include` to an explicit allow-list.
   No route module, no service, and not `src/lib/reporting/standard.ts` (1165
   lines, the core reporting engine) is in it.
2. **The client gate does not exist.** `npm run qa:code-coverage:release` runs
   client coverage, but `scripts/check-code-coverage.mjs` reads only
   `server/coverage/coverage-summary.json`. The client result is computed and
   discarded. `client/vitest.config.ts` lists **3 files** out of 162.
3. **The feature-coverage gate runs no tests.** It parses
   `docs/FEATURE_COVERAGE_MATRIX.md` and passes if every row contains the
   literal string `COVERED`. All 39 rows carry identical boilerplate text. A
   developer can pass the gate by editing a markdown table.
4. **CI runs no end-to-end tests.** There are 21 Playwright specs in
   `tests/e2e/`; `.github/workflows/ci.yml` explicitly skips them.

The risk is not that coverage is low — it is that the gate reports a number
nobody can act on, so low coverage is invisible. This plan does **not** write
the missing tests. It makes the gate report its true scope, enforce both
workspaces, require the feature matrix to cite tests that actually exist, and
ratchet so the numbers can only improve. Writing tests comes after, guided by
honest numbers.

## Current state

Files involved:

- `scripts/check-code-coverage.mjs` — the coverage gate. Server-only.
- `scripts/check-feature-coverage.mjs` — the feature gate. Markdown parser.
- `server/vitest.config.ts` — server coverage scope + thresholds.
- `client/vitest.config.ts` — client coverage scope + thresholds.
- `docs/FEATURE_COVERAGE_MATRIX.md` — the hand-maintained matrix.
- `docs/QA_TESTING_STRATEGY.md` — states the standard the gate implements.
- `.githooks/pre-push` — runs the release gate on every push.
- `package.json` — the `qa:*` script definitions.

`scripts/check-code-coverage.mjs:6-8` — reads only the server summary:

```js
const summaryPath = path.resolve('server/coverage/coverage-summary.json');
const releaseMode = process.argv.includes('--release');
const minimum = Number(process.env.COVERAGE_MINIMUM ?? (releaseMode ? 90 : 0));
```

Note `minimum` is `0` outside release mode — so the non-release gate asserts
nothing at all.

`scripts/check-feature-coverage.mjs:71-74` — the entire feature gate:

```js
if (releaseMode && counts.COVERED !== total) {
  console.error('Release feature coverage gate failed: every feature must be COVERED.');
  process.exit(1);
}
```

`server/vitest.config.ts:9-42` — the allow-list (25 entries, abridged here;
read the file for the full list):

```ts
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: [
        'src/lib/amortization.ts',
        'src/lib/amountParser.ts',
        // ... 21 more lib files ...
        'src/lib/reporting/snapshots.ts',
      ],
      thresholds: {
        statements: 90, branches: 90, functions: 90, lines: 90,
      },
    },
```

`client/vitest.config.ts:12-26` — three files:

```ts
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: [
        "src/pages/recurring/frequency.ts",
        "src/pages/reports/dateRange.ts",
        "src/stores/authStore.ts",
      ],
      thresholds: {
        statements: 90, branches: 90, functions: 90, lines: 90,
      },
    },
```

`docs/FEATURE_COVERAGE_MATRIX.md` — 39 rows, 7 columns
(`Feature | Risk | Unit | API integration | E2E | Status | Next required test`).
Every row's three coverage cells contain identical boilerplate, e.g.:

```markdown
| Signup | critical | covered: unit or helper regression | covered: API/integration regression | covered: E2E or smoke regression | COVERED | No gap tracked; add regression tests with behavior changes |
```

`.githooks/pre-push` — runs the **release** gate on every push:

```sh
echo "Running Kuber release QA gate before push..."
echo "This checks 90% server code coverage and 100% feature coverage."

npm run qa:release-gate
```

`package.json:18-22` — the gate scripts:

```json
"qa:code-coverage:release": "node scripts/run-with-root-env.mjs sh -c \"npm run test:coverage --workspace=server && npm run test:coverage --workspace=@kuber/client && node scripts/check-code-coverage.mjs --release\"",
"qa:feature-coverage": "node scripts/run-with-root-env.mjs node scripts/check-feature-coverage.mjs",
"qa:feature-coverage:release": "node scripts/run-with-root-env.mjs node scripts/check-feature-coverage.mjs --release",
"qa:release-gate": "node scripts/run-with-root-env.mjs sh -c \"npm run qa:code-coverage:release && npm run qa:feature-coverage:release\"",
```

`docs/QA_TESTING_STRATEGY.md:45` already proposes the mechanism this plan
builds — quote it in your commit message if useful:

```
1. Ratchet gates: test config fails if coverage drops below the current baseline while new tests raise the floor by package and feature area.
```

### Repo conventions to follow

- `scripts/*.mjs` are plain Node ESM, no dependencies, `#!/usr/bin/env node`
  shebang, `import fs from 'node:fs'` style, and `process.exit(1)` on failure
  with `console.error` messages prefixed by a dash for list items. Match
  `scripts/check-code-coverage.mjs` exactly — read it fully before writing.
- All npm scripts route through `node scripts/run-with-root-env.mjs` so the
  repo-root `.env` is loaded. Any new script you add to `package.json` must do
  the same.
- Markdown docs use sentence-case headings and pipe tables with a header
  separator row.

## Commands you will need

| Purpose                   | Command                                              | Expected on success                    |
|---------------------------|------------------------------------------------------|----------------------------------------|
| Server coverage           | `npm run test:coverage --workspace=server`            | writes `server/coverage/coverage-summary.json` |
| Client coverage           | `npm run test:coverage --workspace=@kuber/client`     | writes `client/coverage/coverage-summary.json` |
| Coverage gate (ratchet)   | `node scripts/check-code-coverage.mjs`                | exit 0                                 |
| Coverage gate (release)   | `node scripts/check-code-coverage.mjs --release`      | exit 1 today — expected, see Step 5    |
| Feature gate (ratchet)    | `node scripts/check-feature-coverage.mjs`             | exit 0                                 |
| Feature gate (release)    | `node scripts/check-feature-coverage.mjs --release`   | exit 1 today — expected, see Step 5    |
| Full ratchet gate         | `npm run qa:gate`                                     | exit 0 (created in Step 6)             |
| Server tests              | `npm run test --workspace=server`                     | all pass                               |
| Client tests              | `npm run test --workspace=@kuber/client`              | all pass                               |

**Important**: several verifications in this plan expect a **non-zero** exit.
That is the point — the release target is genuinely not met today. Do not
"fix" a failing release-mode gate by lowering the target.

## Scope

**In scope** (the only files you should modify):

- `scripts/check-code-coverage.mjs`
- `scripts/check-feature-coverage.mjs`
- `scripts/coverage-baseline.json` (create)
- `client/vitest.config.ts`
- `docs/FEATURE_COVERAGE_MATRIX.md`
- `docs/QA_TESTING_STRATEGY.md`
- `.githooks/pre-push`
- `package.json` (the `qa:*` scripts only)
- `Makefile` (the `release-gate` target only)

**Out of scope** (do NOT touch, even though they look related):

- `server/vitest.config.ts` — **do not widen the server `include` list in this
  plan.** Widening it drops measured coverage from ~98% to a much lower number
  in the same commit that changes the gate logic, making both changes
  impossible to review. Widening the scope is the follow-on plan; this plan
  makes the current scope *visible*.
- Writing any new unit, integration, or E2E test. This plan changes
  measurement only.
- `.github/workflows/ci.yml` — adding an E2E job needs a Postgres service
  container and a seeded database; it is real work with its own failure modes
  and belongs in its own plan.
- `server/src/**` and `client/src/**` — no application code changes at all.

## Git workflow

- Branch: `test/honest-release-gate`
- Commit style: Conventional Commits. Suggested message:
  `test: make release gate report true coverage scope and ratchet`
- Do NOT push or open a PR unless the operator instructed it.
  Note: the pre-push hook is modified by this plan; if you are asked to push,
  do it only after Step 6 so the hook is in its new state.

## Steps

### Step 1: Make the coverage gate cover both workspaces and report its scope

Rewrite `scripts/check-code-coverage.mjs` so it:

1. Reads **both** `server/coverage/coverage-summary.json` and
   `client/coverage/coverage-summary.json`. If either is missing, error with
   the command that produces it (mirror the existing message style).
2. For each workspace, reports the four metrics **and the measured scope**:
   the number of files present in the coverage summary versus the number of
   source files on disk. Compute files-on-disk by counting entries under
   `server/src/**/*.ts` and `client/src/**/*.{ts,tsx}` with `fs.readdirSync`
   and `{ recursive: true }` (Node 20 supports this — the repo targets Node
   20, see `.github/workflows/ci.yml`).
3. Prints a line that cannot be misread, for example:
   `server: 98.7% statements over 25 of 154 source files (16.2% of workspace in scope)`
4. In `--release` mode, requires each metric ≥ 90 **and** requires the
   in-scope file ratio to meet a `scopeMinimum` (see Step 3).
5. Outside `--release` mode, compares against the ratchet baseline from Step 3
   and fails only on regression.

Keep the existing metric names (`statements`, `branches`, `functions`,
`lines`), the `COVERAGE_MINIMUM` environment override, and the
`process.exit(1)`-with-`console.error` failure style.

**Verify**:
`npm run test:coverage --workspace=server && npm run test:coverage --workspace=@kuber/client`
→ both write `coverage-summary.json`.

**Verify**: `node scripts/check-code-coverage.mjs` → prints one scope line per
workspace, each naming both a percentage and a file count.

### Step 2: Make the feature gate require test files that exist

Rewrite the row validation in `scripts/check-feature-coverage.mjs` so a row can
only count as `COVERED` when it cites real tests:

1. Expect **8** columns instead of 7. The new column is `Tests`, placed
   immediately before `Status`:
   `Feature | Risk | Unit | API integration | E2E | Tests | Status | Next required test`
2. The `Tests` cell holds one or more repo-relative paths separated by `<br>`
   or `, `. Split on `[,\s]*<br>[,\s]*|,\s*` and trim.
3. For a row with status `COVERED`, **every** cited path must exist on disk
   (`fs.existsSync`). A `COVERED` row citing zero paths, or any path that does
   not exist, is a validation failure listed in the existing `invalidRows`
   output.
4. Rows with status `PARTIAL`, `MISSING`, or `BLOCKED` are exempt from the
   path-existence requirement but must still have a non-empty
   `Next required test` cell.
5. Keep the existing `--release` behaviour (all rows must be `COVERED`) and the
   existing counts output.

**Verify**: `node scripts/check-feature-coverage.mjs` → exits non-zero right
now, listing every row as malformed (the matrix still has 7 columns). This
failure is expected and is fixed in Step 4.

### Step 3: Record an honest ratchet baseline

Create `scripts/coverage-baseline.json`. Populate it from the **actual**
numbers printed in Step 1 — do not copy the values below, they are
placeholders showing the shape only:

```json
{
  "_comment": "Ratchet floor. The non-release gate fails if any value regresses. Raise these as coverage improves; never lower them without a recorded reason.",
  "server": {
    "statements": 0, "branches": 0, "functions": 0, "lines": 0,
    "filesInScope": 0, "filesOnDisk": 0
  },
  "client": {
    "statements": 0, "branches": 0, "functions": 0, "lines": 0,
    "filesInScope": 0, "filesOnDisk": 0
  }
}
```

Wire `scripts/check-code-coverage.mjs` to read this file in non-release mode
and fail if any metric, or either `filesInScope` count, drops below the
recorded value. `filesOnDisk` is informational — it grows as the codebase does
and must not cause a failure on its own.

Set `scopeMinimum` for `--release` mode to `90` (percent of workspace source
files that must be in the coverage scope). This is the target, deliberately
not met today.

**Verify**: `node scripts/check-code-coverage.mjs` → exit 0 (current numbers
equal the baseline).

**Verify**: temporarily raise `server.statements` in the baseline by 5, re-run
→ exit 1 with a regression message naming `server` and `statements`. Restore
the real value and confirm exit 0 again. Do not commit the temporary change.

### Step 4: Rewrite the feature matrix honestly

Add the `Tests` column to `docs/FEATURE_COVERAGE_MATRIX.md` and fill it in
**by verification, not by assumption**. For each of the 39 rows:

1. Search for tests covering that feature. Use the test inventory as your
   search space:
   - `ls server/tests/routes/ server/tests/services/ server/tests/lib/`
   - `ls client/tests/ client/tests/pages/`
   - `ls tests/e2e/`
2. If you find test files that genuinely exercise the feature, cite their
   repo-relative paths in the `Tests` cell and set `Status` to `COVERED`.
3. **If you cannot find a test for it, set `Status` to `MISSING`** (or
   `PARTIAL` when tests exist for only some of the required dimensions), leave
   `Tests` listing whatever does exist, and write a concrete, specific
   `Next required test` — e.g. "API test asserting a household member cannot
   read another household's manual assets", not "add regression tests".
4. Replace the identical boilerplate in the `Unit` / `API integration` / `E2E`
   cells with `yes` / `no` / `partial` so the row states a fact rather than a
   sentence.
5. Update the Summary table's counts and the "Last reviewed" date to match
   what you actually recorded.

Being wrong in the optimistic direction is the failure mode to avoid: when
unsure whether a test really covers a feature, mark it `PARTIAL`. The gate you
built in Step 2 will catch fabricated paths, but it cannot catch a real path
cited for the wrong feature.

**Verify**: `node scripts/check-feature-coverage.mjs` → exit 0, printing the
real `COVERED` / `PARTIAL` / `MISSING` / `BLOCKED` counts.

**Verify**: `node scripts/check-feature-coverage.mjs --release` → **exit 1**
unless every row is genuinely `COVERED`. A non-zero exit here is the correct,
expected result and must not be worked around.

### Step 5: Record the release-readiness reality in the QA doc

`docs/QA_TESTING_STRATEGY.md:37-39` currently reports the release coverage
figures without stating their scope, which is what makes them misleading. Update
those lines to state scope alongside percentage, e.g.:

```
- Server Vitest release coverage: <N>% statements across <X> of 154 server source files in the enforced coverage scope. Workspace-wide coverage is not yet enforced.
- Client Vitest release coverage: <N>% statements across <X> of 162 client source files in the enforced coverage scope.
- Feature coverage matrix: <C>/39 rows COVERED with cited test files, <P> PARTIAL, <M> MISSING.
```

Use the real numbers from Steps 1 and 4. Also add one line under the
"Release Gate Standard" section noting that `qa:gate` (ratchet) runs on push
and `qa:release-gate` (targets) runs when cutting a release, and that the
latter does not pass today.

**Verify**: `grep -n "of 154" docs/QA_TESTING_STRATEGY.md` → returns a match.

### Step 6: Split the ratchet gate from the release gate

The pre-push hook must not require release targets that are known not to be
met, or every push fails and developers will disable the hook.

1. In `package.json`, add a ratchet-mode script alongside the release one:
   ```json
   "qa:code-coverage": "node scripts/run-with-root-env.mjs sh -c \"npm run test:coverage --workspace=server && npm run test:coverage --workspace=@kuber/client && node scripts/check-code-coverage.mjs\"",
   "qa:gate": "node scripts/run-with-root-env.mjs sh -c \"npm run qa:code-coverage && npm run qa:feature-coverage\"",
   ```
   Leave `qa:code-coverage:release`, `qa:feature-coverage:release`, and
   `qa:release-gate` unchanged.
2. Change `.githooks/pre-push` to run `npm run qa:gate` and update its echoed
   text to describe the ratchet honestly:
   ```sh
   echo "Running Kuber QA ratchet gate before push..."
   echo "This checks that coverage and feature coverage have not regressed."

   npm run qa:gate
   ```
3. In the `Makefile`, keep `release-gate` pointing at `npm run qa:release-gate`
   and add a `gate` target for the ratchet, matching the existing target style
   (`$(RUN) npm run qa:gate`) with a `##` help comment. Add `gate` to the
   `.PHONY` list at line 25.

**Verify**: `npm run qa:gate` → exit 0.

**Verify**: `make -n gate` → expands to the `qa:gate` command without executing
it.

**Verify**: `npm run qa:release-gate` → exit 1, with output naming the specific
targets not yet met. Expected.

### Step 7: Full verification

**Verify**: `npm run test --workspace=server` → all pass, 0 failing.

**Verify**: `npm run test --workspace=@kuber/client` → all pass, 0 failing.

**Verify**: `npm run lint` → exit 0, no new errors.

**Verify**: `git status --short` → only in-scope files modified/added.

## Test plan

This plan changes tooling, so the "tests" are the gates exercising themselves:

- **Ratchet detects regression**: the temporary baseline bump in Step 3 must
  produce a non-zero exit naming the regressed workspace and metric.
- **Feature gate rejects fabricated paths**: after Step 4, temporarily change
  one `Tests` cell to a path that does not exist
  (e.g. `server/tests/routes/nope.test.ts`), run
  `node scripts/check-feature-coverage.mjs`, and confirm it exits non-zero and
  names that row. Restore the real path and confirm exit 0. Do not commit the
  temporary change.
- **Both workspaces enforced**: temporarily rename
  `client/coverage/coverage-summary.json`, run
  `node scripts/check-code-coverage.mjs`, confirm it fails with a message
  naming the client workspace and the command to regenerate it. Restore the
  file.
- No new Vitest files are added by this plan.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "client/coverage" scripts/check-code-coverage.mjs` returns ≥ 1
- [ ] `grep -c "existsSync" scripts/check-feature-coverage.mjs` returns ≥ 1
- [ ] `scripts/coverage-baseline.json` exists and parses as JSON
      (`node -e "JSON.parse(require('fs').readFileSync('scripts/coverage-baseline.json','utf8'))"` exits 0)
- [ ] `node scripts/check-code-coverage.mjs` exits 0
- [ ] `node scripts/check-feature-coverage.mjs` exits 0
- [ ] `npm run qa:gate` exits 0
- [ ] `grep -q "qa:gate" .githooks/pre-push` exits 0
- [ ] `grep -c "| Tests |" docs/FEATURE_COVERAGE_MATRIX.md` returns 1
- [ ] `grep -c "covered: unit or helper regression" docs/FEATURE_COVERAGE_MATRIX.md`
      returns 0 (all boilerplate replaced)
- [ ] `npm run test --workspace=server` exits 0
- [ ] `npm run test --workspace=@kuber/client` exits 0
- [ ] `git diff --name-only` lists no file under `server/src/` or `client/src/`
- [ ] `git diff --name-only` does not list `server/vitest.config.ts`
- [ ] `plans/README.md` status row for 020 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any excerpt in "Current state" does not match the live file.
- You are tempted to lower the `--release` thresholds (90% metrics, 90% scope,
  100% features) so that `qa:release-gate` passes. It is supposed to fail
  today; making it pass by lowering targets recreates the exact problem this
  plan exists to fix.
- You are tempted to widen `server/vitest.config.ts`'s `include` list. That is
  explicitly out of scope and belongs to the follow-on plan.
- After Step 4 you find fewer than 15 of the 39 features have genuinely
  verifiable tests. That is a materially worse position than assumed and a
  human should see the number before you continue.
- Running `npm run test:coverage --workspace=@kuber/client` fails or writes no
  summary file — the client coverage setup may be broken in a way this plan
  does not account for.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **For the reviewer**: the two things to scrutinise are (a) that no threshold
  was lowered, and (b) that the `Tests` column in the matrix cites files that
  genuinely test the named feature — the script proves the paths exist, not
  that they are relevant. Spot-check five rows against their cited files.
- `scripts/coverage-baseline.json` is now load-bearing. Raise it whenever
  coverage improves; that is the ratchet. Lowering it should require an
  explicit note in the commit message saying why.
- **Immediate follow-on work, deliberately deferred out of this plan**:
  1. Widen `server/vitest.config.ts` `coverage.include` toward the whole
     workspace, one directory at a time, raising the baseline as tests land.
     Start with `src/services/` and `src/lib/reporting/standard.ts` — the
     largest untested surfaces.
  2. Widen `client/vitest.config.ts` beyond its 3 files.
  3. Add a Playwright job to `.github/workflows/ci.yml` with a Postgres
     service container so the 21 existing E2E specs actually run.
- The `filesOnDisk` counts in the baseline will drift as the codebase grows.
  That is intentional and informational; only `filesInScope` and the four
  metrics gate.
