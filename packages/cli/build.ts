import { build, context } from 'esbuild';
import { rmSync, readdirSync, statSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'dist');
const isWatch = process.argv.includes('--watch');

// Generate src/generated/version.ts from package.json so the version is
// available without a runtime `require('../package.json')` (which breaks in a
// `bun build --compile` single binary).
const pkgVersion = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf-8'),
).version as string;
const generatedDir = join(__dirname, 'src/generated');
mkdirSync(generatedDir, { recursive: true });
writeFileSync(
  join(generatedDir, 'version.ts'),
  `export const VERSION = '${pkgVersion}';\n`,
);

// Stub for the Bun single-binary embedded-assets manifest. `bun run build-bun`
// replaces it with real entries and restores this afterward.
const embeddedAssetsFile = join(generatedDir, 'embedded-assets.ts');
if (!existsSync(embeddedAssetsFile)) {
  writeFileSync(
    embeddedAssetsFile,
    'export const EMBEDDED_ASSETS: Record<string, string> = {};\n',
  );
}

for (const entry of readdirSync(distDir)) {
  if (entry === 'ui') {
    continue;
  }
  const fullPath = join(distDir, entry);
  const stat = statSync(fullPath);
  rmSync(fullPath, { recursive: stat.isDirectory(), force: true });
}

const buildOptions = {
  entryPoints: [join(__dirname, 'src/index.ts')],
  bundle: true,
  platform: 'node' as const,
  target: 'node18',
  format: 'esm' as const,
  outfile: join(distDir, 'index.js'),
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: [
    'better-sqlite3',
    'commander',
    'open',
    'picocolors',
  ],
  sourcemap: isWatch,
  minifySyntax: !isWatch,
  treeShaking: true,
};

if (isWatch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await build(buildOptions);
}
