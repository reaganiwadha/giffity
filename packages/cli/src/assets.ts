/**
 * Embedded UI assets for the `bun build --compile` single binary.
 *
 * When the CLI runs as a compiled Bun executable there is no `dist/ui/client`
 * directory on disk, so the built frontend is embedded into the binary via
 * `scripts/gen-embedded-assets.ts` (which writes `generated/embedded-assets.ts`
 * with `import … with { type: "file" }` entries that Bun bundles).
 *
 * Under Node / tsx the generated module is absent (and its import attributes
 * are Bun-specific), so this stays an empty manifest and the server falls back
 * to serving from disk.
 */

import { EMBEDDED_ASSETS } from './generated/embedded-assets.js';

// `generated/embedded-assets.ts` is a stub (empty map) for normal Node builds
// and is replaced with real `import … with { type: "file" }` entries by
// `scripts/gen-embedded-assets.ts` during `bun run build-bun`.
const manifest: Record<string, string> = EMBEDDED_ASSETS;

// Retained for call-site compatibility; nothing async to do any more.
export async function ensureEmbeddedAssets(): Promise<void> {}

export function hasEmbeddedAssets(): boolean {
  return Object.keys(manifest).length > 0;
}

/** Reads an embedded asset by its URL path (e.g. `/index.html`). */
export async function readEmbeddedAsset(
  urlPath: string,
): Promise<Uint8Array | null> {
  const filePath = manifest[urlPath];
  if (!filePath) {
    return null;
  }
  const bun = (globalThis as unknown as {
    Bun: { file(p: string): { arrayBuffer(): Promise<ArrayBuffer> } };
  }).Bun;
  return new Uint8Array(await bun.file(filePath).arrayBuffer());
}
