#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const releaseMode = process.argv.includes('--release');
const metrics = ['statements', 'branches', 'functions', 'lines'];

// Percent of each workspace's source files that must sit inside the enforced
// coverage scope before the release gate can pass. Deliberately not met today:
// the point of this gate is to make that visible rather than to report a high
// percentage measured over a hand-picked handful of files.
const SCOPE_MINIMUM = 90;

const baselinePath = path.resolve('scripts/coverage-baseline.json');

const workspaces = [
  {
    name: 'server',
    summary: path.resolve('server/coverage/coverage-summary.json'),
    sourceDir: path.resolve('server/src'),
    extensions: ['.ts'],
    command: 'npm run test:coverage --workspace=server',
  },
  {
    name: 'client',
    summary: path.resolve('client/coverage/coverage-summary.json'),
    sourceDir: path.resolve('client/src'),
    extensions: ['.ts', '.tsx'],
    command: 'npm run test:coverage --workspace=@kuber/client',
  },
];

function countSourceFiles(dir, extensions) {
  if (!fs.existsSync(dir)) return 0;
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext)))
    .length;
}

function readSummary(workspace) {
  if (!fs.existsSync(workspace.summary)) {
    console.error(`Coverage summary not found: ${workspace.summary}`);
    console.error(`Run \`${workspace.command}\` first.`);
    process.exit(1);
  }

  const summary = JSON.parse(fs.readFileSync(workspace.summary, 'utf8'));
  if (!summary.total) {
    console.error(`Coverage summary is malformed: ${workspace.summary}`);
    process.exit(1);
  }
  return summary;
}

const results = [];

for (const workspace of workspaces) {
  const summary = readSummary(workspace);
  const filesInScope = Object.keys(summary).filter((key) => key !== 'total').length;
  const filesOnDisk = countSourceFiles(workspace.sourceDir, workspace.extensions);
  const scopePercent = filesOnDisk === 0 ? 0 : Math.round((filesInScope / filesOnDisk) * 1000) / 10;

  const pcts = {};
  for (const metric of metrics) {
    pcts[metric] = Number(summary.total[metric]?.pct);
  }

  results.push({ ...workspace, filesInScope, filesOnDisk, scopePercent, pcts });

  // A percentage is only meaningful alongside what it was measured over.
  console.log(
    `${workspace.name}: ${pcts.statements}% statements over ${filesInScope} of ${filesOnDisk} ` +
      `source files (${scopePercent}% of workspace in scope)`,
  );
  console.log(
    `  branches=${pcts.branches}% functions=${pcts.functions}% lines=${pcts.lines}%`,
  );
}

const failures = [];

if (releaseMode) {
  const minimum = Number(process.env.COVERAGE_MINIMUM ?? 90);

  for (const result of results) {
    for (const metric of metrics) {
      const pct = result.pcts[metric];
      if (!Number.isFinite(pct)) {
        failures.push(`${result.name} ${metric}: missing`);
      } else if (pct < minimum) {
        failures.push(`${result.name} ${metric}: ${pct}% < ${minimum}%`);
      }
    }

    if (result.scopePercent < SCOPE_MINIMUM) {
      failures.push(
        `${result.name} scope: ${result.scopePercent}% of source files measured ` +
          `(${result.filesInScope} of ${result.filesOnDisk}) < ${SCOPE_MINIMUM}%`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(`\nRelease coverage gate failed. Required: ${minimum}% per metric, ${SCOPE_MINIMUM}% of files in scope.`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`\nRelease coverage gate passed. Required: ${minimum}% per metric, ${SCOPE_MINIMUM}% of files in scope.`);
  process.exit(0);
}

// Ratchet mode: fail only on regression against the recorded baseline.
if (!fs.existsSync(baselinePath)) {
  console.error(`Coverage baseline not found: ${baselinePath}`);
  console.error('Create it from the numbers printed above.');
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

for (const result of results) {
  const floor = baseline[result.name];
  if (!floor) {
    failures.push(`${result.name}: no baseline recorded`);
    continue;
  }

  for (const metric of metrics) {
    const pct = result.pcts[metric];
    if (!Number.isFinite(pct)) {
      failures.push(`${result.name} ${metric}: missing`);
    } else if (pct < floor[metric]) {
      failures.push(`${result.name} ${metric}: ${pct}% regressed below baseline ${floor[metric]}%`);
    }
  }

  // filesOnDisk is informational — it grows with the codebase and must not fail
  // the gate on its own. Shrinking the measured scope is a regression.
  if (result.filesInScope < floor.filesInScope) {
    failures.push(
      `${result.name} filesInScope: ${result.filesInScope} regressed below baseline ${floor.filesInScope}`,
    );
  }
}

if (failures.length > 0) {
  console.error('\nCoverage ratchet failed. Coverage must not drop below the recorded baseline:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(`\nBaseline: ${baselinePath}`);
  process.exit(1);
}

console.log('\nCoverage ratchet passed. No regression against the recorded baseline.');
