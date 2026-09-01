/**
 * Drop-in stand-in for `better-sqlite3` used only in the `bun build --compile`
 * single binary, where `better-sqlite3`'s native `bindings` lookup fails.
 * `scripts/build-bun.ts` aliases `better-sqlite3` to this module.
 *
 * `bun:sqlite`'s `Database` already matches the subset of the better-sqlite3
 * API this codebase uses (`prepare().get/all/run`, `exec`, `transaction`,
 * `close`) — the only gap is `.pragma()`, polyfilled here.
 */
// @ts-nocheck - bun:sqlite is only resolvable inside the Bun bundle
import { Database as BunDatabase } from 'bun:sqlite';

class Database extends BunDatabase {
  constructor(filename?: string, options?: Record<string, unknown>) {
    super(filename ?? ':memory:', { create: true, ...options });
  }

  pragma(source: string, opts?: { simple?: boolean }): unknown {
    const stmt = source.trim();
    if (stmt.includes('=')) {
      this.exec(`PRAGMA ${stmt}`);
      return undefined;
    }
    const rows = this.query(`PRAGMA ${stmt}`).all() as Record<
      string,
      unknown
    >[];
    if (opts?.simple) {
      return rows.length ? Object.values(rows[0])[0] : undefined;
    }
    return rows;
  }
}

export default Database;
export { Database };
