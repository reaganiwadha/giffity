import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrations, runMigrations } from '../src/migrations.js';
import { setDbForTesting } from '../src/db.js';
import { refToLanes, laneSig, autoName } from '../src/lanes.js';
import {
  findOrCreateSessionByLanes,
  getCurrentSession,
  getSession,
  listSessions,
  renameSession,
  setSessionLanes,
  archiveSession,
  sessionToLegacyRef,
} from '../src/sessions.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  setDbForTesting(db);
});

afterEach(() => {
  setDbForTesting(null);
  db.close();
});

describe('lanes helpers', () => {
  it('derives lanes from legacy refs', () => {
    expect(refToLanes('main..feature')).toEqual([
      { ref: 'main' },
      { ref: 'feature' },
    ]);
    expect(refToLanes('work')).toEqual([{ ref: 'HEAD' }, { ref: 'work' }]);
    expect(refToLanes('.')).toEqual([{ ref: 'HEAD' }, { ref: 'work' }]);
    expect(refToLanes('abc1234')).toEqual([
      { ref: 'abc1234' },
      { ref: 'work' },
    ]);
    expect(refToLanes('__tree__')).toEqual([]);
  });

  it('normalizes the lane signature and auto name', () => {
    expect(laneSig([{ ref: ' main ' }, { ref: '.' }])).toBe('main → work');
    expect(autoName([{ ref: 'main' }, { ref: 'HEAD~1' }, { ref: 'work' }])).toBe(
      'main → HEAD~1 → work',
    );
  });
});

describe('migration 2 — legacy review_sessions', () => {
  function seedLegacy() {
    // Apply only migration 1, then seed legacy rows, so migration 2's data
    // migration has something to convert.
    db.exec(
      'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime(\'now\')))',
    );
    migrations[0].up(db);
    db.prepare('INSERT INTO schema_migrations (version, name) VALUES (1, ?)').run(
      migrations[0].name,
    );
    db.prepare(
      'INSERT INTO review_sessions (id, ref, head_hash, created_at) VALUES (?, ?, ?, ?)',
    ).run('s-work', 'work', 'h1', '2024-01-01T00:00:00.000Z');
    db.prepare(
      'INSERT INTO review_sessions (id, ref, head_hash, created_at) VALUES (?, ?, ?, ?)',
    ).run('s-range', 'main..feature', 'h2', '2024-01-02T00:00:00.000Z');
    db.prepare(
      'INSERT INTO comment_threads (id, session_id, file_path, side, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('t1', 's-range', 'src/a.ts', 'new', 10, 10);
    db.prepare(
      'INSERT INTO comments (id, thread_id, author_name, author_type, body) VALUES (?, ?, ?, ?, ?)',
    ).run('c1', 't1', 'You', 'user', 'hi');
  }

  it('migrates every row, preserves threads, and re-points the FK', () => {
    // Baseline migration runs, then we seed, then re-run to apply migration 2.
    seedLegacy();
    runMigrations(db);

    const sessions = db
      .prepare('SELECT id, name, kind FROM sessions ORDER BY id')
      .all() as { id: string; name: string; kind: string }[];
    expect(sessions.map((s) => s.id)).toEqual(['s-range', 's-work']);

    const rangeLanes = db
      .prepare(
        'SELECT ref FROM session_lanes WHERE session_id = ? ORDER BY position',
      )
      .all('s-range') as { ref: string }[];
    expect(rangeLanes.map((l) => l.ref)).toEqual(['main', 'feature']);

    // Thread + comment survived the comment_threads table rebuild.
    const thread = db
      .prepare('SELECT session_id FROM comment_threads WHERE id = ?')
      .get('t1') as { session_id: string };
    expect(thread.session_id).toBe('s-range');
    const comment = db
      .prepare('SELECT COUNT(*) AS c FROM comments WHERE thread_id = ?')
      .get('t1') as { c: number };
    expect(comment.c).toBe(1);

    // FK now points at sessions: an orphan insert must fail.
    db.pragma('foreign_keys = ON');
    expect(() =>
      db
        .prepare(
          'INSERT INTO comment_threads (id, session_id, file_path, side, start_line, end_line) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('t2', 'nope', 'x', 'new', 1, 1),
    ).toThrow();
  });
});

describe('sessions store', () => {
  beforeEach(() => runMigrations(db));

  it('find-or-create is idempotent by lane signature', () => {
    const a = findOrCreateSessionByLanes([{ ref: 'main' }, { ref: '.' }]);
    const b = findOrCreateSessionByLanes([{ ref: ' main ' }, { ref: 'work' }]);
    expect(b.id).toBe(a.id);
    expect(listSessions()).toHaveLength(1);
    expect(a.lanes.map((l) => l.ref)).toEqual(['main', 'work']);
  });

  it('de-duplicates names on collision', () => {
    const a = findOrCreateSessionByLanes([{ ref: 'main' }, { ref: 'work' }]);
    expect(a.name).toBe('main → work');
    const b = findOrCreateSessionByLanes([{ ref: 'main' }, { ref: 'staged' }], {
      name: 'main → work',
    });
    expect(b.name).toBe('main → work-2');
  });

  it('getCurrentSession returns the most recently opened non-archived diff session', () => {
    const first = findOrCreateSessionByLanes([{ ref: 'main' }, { ref: 'work' }]);
    const second = findOrCreateSessionByLanes([
      { ref: 'main' },
      { ref: 'staged' },
    ]);
    db.prepare('UPDATE sessions SET last_opened_at = ? WHERE id = ?').run(
      '2030-01-01T00:00:00.000Z',
      second.id,
    );
    expect(getCurrentSession()?.id).toBe(second.id);

    archiveSession(second.id, true);
    db.prepare('UPDATE sessions SET last_opened_at = ? WHERE id = ?').run(
      '2029-01-01T00:00:00.000Z',
      first.id,
    );
    expect(getCurrentSession()?.id).toBe(first.id);
  });

  it('renames stick and lanes can be replaced', () => {
    const s = findOrCreateSessionByLanes([{ ref: 'main' }, { ref: 'work' }]);
    const renamed = renameSession(s.id, { title: 'My review' });
    expect(renamed.title).toBe('My review');

    const relaned = setSessionLanes(s.id, [
      { ref: 'develop' },
      { ref: 'HEAD~2' },
      { ref: 'work' },
    ]);
    expect(relaned.lanes.map((l) => l.ref)).toEqual([
      'develop',
      'HEAD~2',
      'work',
    ]);
    expect(getSession(s.id)?.laneSig).toBe('develop → HEAD~2 → work');
  });

  it('collapses a session to a legacy ref', () => {
    const work = findOrCreateSessionByLanes([{ ref: 'HEAD' }, { ref: 'work' }]);
    expect(sessionToLegacyRef(work)).toBe('work');
    const range = findOrCreateSessionByLanes([
      { ref: 'main' },
      { ref: 'feature' },
    ]);
    expect(sessionToLegacyRef(range)).toBe('main..feature');
    const branch = findOrCreateSessionByLanes([
      { ref: 'main' },
      { ref: 'work' },
    ]);
    expect(sessionToLegacyRef(branch)).toBe('main');
  });
});
