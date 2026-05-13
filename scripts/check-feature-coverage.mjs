#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const matrixPath = path.resolve('docs/FEATURE_COVERAGE_MATRIX.md');
const releaseMode = process.argv.includes('--release');
const allowedStatuses = new Set(['COVERED', 'PARTIAL', 'MISSING', 'BLOCKED']);

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

if (!fs.existsSync(matrixPath)) {
  console.error(`Feature coverage matrix not found: ${matrixPath}`);
  process.exit(1);
}

const rows = fs
  .readFileSync(matrixPath, 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.startsWith('| ') && line.endsWith(' |'))
  .map(splitRow)
  .filter((cells) => cells.length === 7 && cells[0] !== 'Feature' && !cells[0].startsWith('---'));

if (rows.length === 0) {
  console.error('Feature coverage matrix has no feature rows.');
  process.exit(1);
}

const counts = {
  COVERED: 0,
  PARTIAL: 0,
  MISSING: 0,
  BLOCKED: 0,
};
const invalidRows = [];

for (const row of rows) {
  const [feature, , unit, api, e2e, status, nextRequiredTest] = row;

  if (!allowedStatuses.has(status)) {
    invalidRows.push(`${feature}: invalid status "${status}"`);
    continue;
  }

  counts[status] += 1;

  if (!unit || !api || !e2e || !nextRequiredTest) {
    invalidRows.push(`${feature}: missing coverage detail`);
  }
}

if (invalidRows.length > 0) {
  console.error('Feature coverage matrix is malformed:');
  for (const issue of invalidRows) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

const total = rows.length;
const coveredPercent = Math.round((counts.COVERED / total) * 10000) / 100;

console.log(`Feature coverage rows: ${total}`);
console.log(`COVERED=${counts.COVERED} PARTIAL=${counts.PARTIAL} MISSING=${counts.MISSING} BLOCKED=${counts.BLOCKED}`);
console.log(`Feature coverage: ${coveredPercent}%`);

if (releaseMode && counts.COVERED !== total) {
  console.error('Release feature coverage gate failed: every feature must be COVERED.');
  process.exit(1);
}
