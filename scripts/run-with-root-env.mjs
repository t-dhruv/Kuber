#!/usr/bin/env node

import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(repoRoot, ".env");

if (existsSync(envPath)) {
  loadEnvFile(envPath);
}

const rawArgs = process.argv.slice(2);
let cwd = repoRoot;

if (rawArgs[0] === "--cwd") {
  const cwdArg = rawArgs[1];
  if (!cwdArg) {
    console.error("Usage: node scripts/run-with-root-env.mjs [--cwd <path>] <command> [...args]");
    process.exit(2);
  }

  cwd = resolve(repoRoot, cwdArg);
  rawArgs.splice(0, 2);
}

const command = rawArgs[0];
const args = rawArgs.slice(1);

if (!command) {
  console.error("Usage: node scripts/run-with-root-env.mjs [--cwd <path>] <command> [...args]");
  process.exit(2);
}

const child = spawn(command, args, {
  cwd,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
