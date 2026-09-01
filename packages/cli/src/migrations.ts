import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { autoName, laneSig, refToLanes } from './lanes.js';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

/**
 * Ordered list of schema migrations. Never edit or reorder an existing entry
 * once it has shipped — only append. Each `up` runs exactly once per database,
 * inside a transaction, and the applied version is recorded in
 * `schema_migrations`.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'baseline',
    up: (db) => {
      // The original diffity schema. `IF NOT EXISTS` keeps this a no-op for
      // databases created before the migration runner existed — they simply
      // adopt version 1.
      db.exec(`
        CREATE TABLE IF NOT EXISTS review_sessions (
          id TEXT PRIMARY KEY,
          ref TEXT NOT NULL,
          head_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS comment_threads (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES review_sessions(id),
          file_path TEXT NOT NULL,
          side TEXT NOT NULL,
          start_line INTEGER NOT NULL,
          end_line INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          anchor_content TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS comments (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
          author_name TEXT NOT NULL,
          author_type TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_threads_session ON comment_threads(session_id);
        CREATE INDEX IF NOT EXISTS idx_comments_thread ON comments(thread_id);

        CREATE TABLE IF NOT EXISTS tours (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES review_sessions(id),
          topic TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'building',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tour_steps (
          id TEXT PRIMARY KEY,
          tour_id TEXT NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
          sort_order INTEGER NOT NULL,
          file_path TEXT NOT NULL,
          start_line INTEGER NOT NULL,
          end_line INTEGER NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          annotation TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_tours_session ON tours(session_id);
        CREATE INDEX IF NOT EXISTS idx_tour_steps_tour ON tour_steps(tour_id);
      `);
    },
  },
  {
    version: 2,
    name: 'sessions-and-lanes',
    up: (db) => {
      db.exec(`
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          title TEXT,
          auto_named INTEGER NOT NULL DEFAULT 1,
          lane_sig TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT 'diff',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_opened_at TEXT NOT NULL DEFAULT (datetime('now')),
          archived INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE session_lanes (
          session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          position INTEGER NOT NULL,
          ref TEXT NOT NULL,
          label TEXT,
          PRIMARY KEY (session_id, position)
        );

        CREATE INDEX idx_sessions_last_opened ON sessions(last_opened_at DESC);
      `);

      // Carry legacy review_sessions rows over, reusing the same id so
      // comment_threads.session_id / tours.session_id stay valid.
      const legacy = db
        .prepare('SELECT id, ref, created_at FROM review_sessions')
        .all() as { id: string; ref: string; created_at: string }[];

      const insertSession = db.prepare(
        `INSERT INTO sessions (id, name, title, auto_named, lane_sig, kind, created_at, last_opened_at, archived)
         VALUES (@id, @name, NULL, 1, @lane_sig, @kind, @created_at, @created_at, 0)`,
      );
      const insertLane = db.prepare(
        'INSERT INTO session_lanes (session_id, position, ref, label) VALUES (?, ?, ?, ?)',
      );

      const usedNames = new Set<string>();
      const uniqueName = (base: string): string => {
        let candidate = base;
        let n = 2;
        while (usedNames.has(candidate)) {
          candidate = `${base}-${n++}`;
        }
        usedNames.add(candidate);
        return candidate;
      };

      for (const row of legacy) {
        const lanes = refToLanes(row.ref);
        const kind = lanes.length === 0 ? 'tree' : 'diff';
        insertSession.run({
          id: row.id,
          name: uniqueName(autoName(lanes)),
          lane_sig: laneSig(lanes),
          kind,
          created_at: row.created_at,
        });
        lanes.forEach((lane, i) => {
          insertLane.run(row.id, i, lane.ref, lane.label ?? null);
        });
      }

      // Re-point the comment_threads / tours FKs from review_sessions to
      // sessions via the standard table-rebuild (foreign_keys is OFF for the
      // duration of runMigrations).
      db.exec(`
        CREATE TABLE comment_threads_new (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id),
          file_path TEXT NOT NULL,
          side TEXT NOT NULL,
          start_line INTEGER NOT NULL,
          end_line INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          anchor_content TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO comment_threads_new
          SELECT id, session_id, file_path, side, start_line, end_line,
                 status, anchor_content, created_at, updated_at
          FROM comment_threads;
        DROP TABLE comment_threads;
        ALTER TABLE comment_threads_new RENAME TO comment_threads;
        CREATE INDEX idx_threads_session ON comment_threads(session_id);

        CREATE TABLE tours_new (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id),
          topic TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'building',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO tours_new
          SELECT id, session_id, topic, body, status, created_at FROM tours;
        DROP TABLE tours;
        ALTER TABLE tours_new RENAME TO tours;
        CREATE INDEX idx_tours_session ON tours(session_id);
      `);
    },
  },
];

/**
 * Runs every migration whose version is greater than the highest already
 * recorded in `schema_migrations`. Idempotent: a second call is a no-op.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const row = db
    .prepare('SELECT MAX(version) AS version FROM schema_migrations')
    .get() as { version: number | null };
  const current = row.version ?? 0;

  const pending = migrations
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) {
    return;
  }

  const insert = db.prepare(
    'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
  );

  // Some migrations rebuild tables to re-point foreign keys. Per the SQLite
  // "12-step ALTER TABLE" guidance, foreign_keys must be toggled *outside* any
  // transaction, so we do it here around the whole batch.
  const fkWasOn = db.pragma('foreign_keys', { simple: true }) === 1;
  if (fkWasOn) {
    db.pragma('foreign_keys = OFF');
  }

  try {
    for (const migration of pending) {
      const apply = db.transaction(() => {
        migration.up(db);
        insert.run(migration.version, migration.name);
      });
      apply();
    }

    const violations = db.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) {
      throw new Error(
        `Migration left ${violations.length} foreign-key violation(s): ${JSON.stringify(violations)}`,
      );
    }
  } finally {
    if (fkWasOn) {
      db.pragma('foreign_keys = ON');
    }
  }
}
