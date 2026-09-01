/**
 * Guard for scripts that must run under Bun (single-binary build). Import for
 * the side effect at the top of the script:
 *
 *   import '../scripts/lib/require-bun.js';
 */
if (typeof (globalThis as { Bun?: unknown }).Bun === 'undefined') {
  console.error(
    '\x1b[31mThis script must be run with bun, not node.\x1b[0m\n' +
      'Try:  bun run build-bun',
  );
  process.exit(1);
}
