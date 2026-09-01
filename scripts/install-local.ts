#!/usr/bin/env bun
import './lib/require-bun.ts';
import { copyFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { buildBinary, binaryName } from './build-bun.ts';

// 1. Build the single binary.
const built = await buildBinary();

// 2. Install it onto PATH.
const isWin = process.platform === 'win32';
const dest =
  process.env.GIFFITY_BIN_DIR ||
  (isWin
    ? join(process.env.LOCALAPPDATA ?? homedir(), 'Programs', 'giffity')
    : join(homedir(), '.local', 'bin'));

mkdirSync(dest, { recursive: true });
const target = join(dest, binaryName());
copyFileSync(built, target);
if (!isWin) {
  chmodSync(target, 0o755);
}

console.log(`\n✓ installed ${binaryName()} -> ${target}`);

const sep = isWin ? ';' : ':';
if (!(process.env.PATH ?? '').split(sep).includes(dest)) {
  console.log(`\nAdd this directory to your PATH:\n  ${dest}`);
  console.log(
    isWin
      ? `  setx PATH "%PATH%;${dest}"`
      : `  echo 'export PATH="${dest}:$PATH"' >> ~/.zshrc`,
  );
}
