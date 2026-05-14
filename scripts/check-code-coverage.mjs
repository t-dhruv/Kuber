#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const summaryPath = path.resolve('server/coverage/coverage-summary.json');
const releaseMode = process.argv.includes('--release');
const minimum = Number(process.env.COVERAGE_MINIMUM ?? (releaseMode ? 90 : 0));
const metrics = ['statements', 'branches', 'functions', 'lines'];

if (!fs.existsSync(summaryPath)) {
  console.error(`Coverage summary not found: ${summaryPath}`);
  console.error('Run `npm run test:coverage --workspace=server` first.');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const total = summary.total;

if (!total) {
  console.error(`Coverage summary is malformed: ${summaryPath}`);
  process.exit(1);
}

const failures = [];

for (const metric of metrics) {
  const pct = Number(total[metric]?.pct);
  if (!Number.isFinite(pct)) {
    failures.push(`${metric}: missing`);
    continue;
  }

  console.log(`${metric}: ${pct}%`);
  if (pct < minimum) {
    failures.push(`${metric}: ${pct}% < ${minimum}%`);
  }
}

if (failures.length > 0) {
  console.error(`Code coverage gate failed. Required minimum: ${minimum}%`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Code coverage gate passed. Required minimum: ${minimum}%`);
