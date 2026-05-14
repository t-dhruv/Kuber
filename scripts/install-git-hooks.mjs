#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const hooksPath = '.githooks';
const repoRoot = process.cwd();

if (process.env.CI || !fs.existsSync(path.join(repoRoot, '.git'))) {
  process.exit(0);
}

execFileSync('git', ['config', 'core.hooksPath', hooksPath], {
  cwd: repoRoot,
  stdio: 'inherit',
});

console.log(`Git hooks installed from ${hooksPath}`);
