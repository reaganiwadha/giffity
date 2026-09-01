import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations, migrations } from '../src/migrations.js';

function tableNames(db: Database.Database): Set<string> {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

function indexNames(db: Database.Database): Set<string> {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

describe('runMigrations', () => {
  it('applies the baseline schema and records the version', () => {
    const db = new Database(':memory:');
    runMigrations(db);

    const tables = tableNames(db);
    for (const t of [
      'schema_migrations',
      'review_sessions',
      'comment_threads',
      'comments',
      'tours',
      'tour_steps',
    ]) {
      expect(tables.has(t)).toBe(true);
    }

    const idx = indexNames(db);
    for (const i of [
      'idx_threads_session',
      'idx_comments_thread',
      'idx_tours_session',
      'idx_tour_steps_tour',
    ]) {
      expect(idx.has(i)).toBe(true);
    }

    const applied = db
      .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
      .all() as { version: number; name: string }[];
    expect(applied).toEqual([{ version: 1, name: 'baseline' }]);

    db.close();
  });

  it('is idempotent — a second run is a no-op', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    const before = db
      .prepare('SELECT COUNT(*) AS c FROM schema_migrations')
      .get() as { c: number };

    expect(() => runMigrations(db)).not.toThrow();

    const after = db
      .prepare('SELECT COUNT(*) AS c FROM schema_migrations')
      .get() as { c: number };
    expect(after.c).toBe(before.c);
    expect(after.c).toBe(migrations.length);

    db.close();
  });

  it('adopts a pre-existing legacy database at version 1 without data loss', () => {
    const db = new Database(':memory:');
    // Simulate a DB created by the old `migrateDb()` (no schema_migrations).
    migrations[0].up(db);
    db.prepare(
      'INSERT INTO review_sessions (id, ref, head_hash) VALUES (?, ?, ?)',
    ).run('s1', 'work', 'abc123');

    runMigrations(db);

    const version = db
      .prepare('SELECT MAX(version) AS v FROM schema_migrations')
      .get() as { v: number };
    expect(version.v).toBe(1);

    const session = db
      .prepare('SELECT ref FROM review_sessions WHERE id = ?')
      .get('s1') as { ref: string };
    expect(session.ref).toBe('work');

    db.close();
  });
});
