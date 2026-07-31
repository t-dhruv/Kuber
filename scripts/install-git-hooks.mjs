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

// Git silently ignores hooks that are not executable, which makes a broken
// hook look exactly like a passing one. Set the bit on install so a fresh
// clone actually runs the gate.
for (const hook of fs.readdirSync(path.join(repoRoot, hooksPath))) {
  fs.chmodSync(path.join(repoRoot, hooksPath, hook), 0o755);
}

console.log(`Git hooks installed from ${hooksPath}`);
