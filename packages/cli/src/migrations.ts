import type Database from 'better-sqlite3';

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

  const insert = db.prepare(
    'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
  );

  for (const migration of pending) {
    const apply = db.transaction(() => {
      migration.up(db);
      insert.run(migration.version, migration.name);
    });
    apply();
  }
}
