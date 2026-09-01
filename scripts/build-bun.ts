#!/usr/bin/env bun
import './lib/require-bun.ts';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function binaryName(): string {
  return process.platform === 'win32' ? 'giffity.exe' : 'giffity';
}

export function binaryPath(): string {
  return join(root, 'dist-bin', binaryName());
}

/** Builds the self-contained Bun binary at `dist-bin/giffity(.exe)`. */
export async function buildBinary(): Promise<string> {
  const run = (cmd: string) =>
    execSync(cmd, { cwd: root, stdio: 'inherit' });

  const relOut = join('dist-bin', binaryName());
  const absOut = binaryPath();
  const generated = join(root, 'packages/cli/src/generated/embedded-assets.ts');
  const sqliteShim = join(root, 'packages/cli/src/sqlite-bun.ts');

  // 1. Full build so packages/*/dist and packages/cli/dist/ui/client exist.
  run('npm run build');

  // 2. Codegen the embedded-UI manifest (Bun-only `type: "file"` imports).
  run('bun run scripts/gen-embedded-assets.ts');

  try {
    mkdirSync(join(root, 'dist-bin'), { recursive: true });
    rmSync(absOut, { force: true });

    // 3. Compile. `better-sqlite3` is swapped for a bun:sqlite shim — its
    //    native `bindings` lookup does not survive `--compile`.
    const result = await Bun.build({
      entrypoints: [join(root, 'packages/cli/src/index.ts')],
      target: 'bun',
      compile: { outfile: absOut },
      plugins: [
        {
          name: 'sqlite-swap',
          setup(build) {
            build.onResolve({ filter: /^better-sqlite3$/ }, () => ({
              path: sqliteShim,
            }));
          },
        },
      ],
    });

    if (!result.success) {
      for (const log of result.logs) console.error(log);
      throw new Error('bun build failed');
    }
  } finally {
    // 4. Restore the empty stub so `npm run build` / `tsc` / `npm test` don't
    //    choke on the Bun-only `type: "file"` import attributes.
    writeFileSync(
      generated,
      'export const EMBEDDED_ASSETS: Record<string, string> = {};\n',
    );
  }

  if (!existsSync(absOut)) {
    throw new Error('Build produced no binary.');
  }
  console.log(`\n✓ ${relOut}`);
  return absOut;
}

if (import.meta.main) {
  await buildBinary();
}
