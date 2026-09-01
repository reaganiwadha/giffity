import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDiffityDir } from '@diffity/git';
import { getDb } from './db.js';
import {
  autoName,
  isWorkingTreeLaneRef,
  laneSig,
  normalizeLaneRef,
  type LaneInput,
} from './lanes.js';

export interface Lane {
  position: number;
  ref: string;
  label: string | null;
}

export type SessionKind = 'diff' | 'tree';

export interface SessionRecord {
  id: string;
  name: string;
  title: string | null;
  autoNamed: boolean;
  laneSig: string;
  kind: SessionKind;
  createdAt: string;
  lastOpenedAt: string;
  archived: boolean;
  lanes: Lane[];
}

interface SessionRow {
  id: string;
  name: string;
  title: string | null;
  auto_named: number;
  lane_sig: string;
  kind: string;
  created_at: string;
  last_opened_at: string;
  archived: number;
}

function currentSessionFilePath(): string {
  return join(getDiffityDir(), 'current-session');
}

function lanesForSession(id: string): Lane[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT position, ref, label FROM session_lanes WHERE session_id = ? ORDER BY position ASC',
    )
    .all(id) as { position: number; ref: string; label: string | null }[];
  return rows.map((r) => ({ position: r.position, ref: r.ref, label: r.label }));
}

function rowToSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    autoNamed: row.auto_named === 1,
    laneSig: row.lane_sig,
    kind: row.kind as SessionKind,
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at,
    archived: row.archived === 1,
    lanes: lanesForSession(row.id),
  };
}

function uniqueName(base: string): string {
  const db = getDb();
  const taken = new Set(
    (db.prepare('SELECT name FROM sessions').all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );
  if (!taken.has(base)) {
    return base;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) {
    n++;
  }
  return `${base}-${n}`;
}

function writeLanes(sessionId: string, lanes: LaneInput[]): void {
  const db = getDb();
  db.prepare('DELETE FROM session_lanes WHERE session_id = ?').run(sessionId);
  const insert = db.prepare(
    'INSERT INTO session_lanes (session_id, position, ref, label) VALUES (?, ?, ?, ?)',
  );
  lanes.forEach((lane, i) => {
    insert.run(sessionId, i, normalizeLaneRef(lane.ref), lane.label ?? null);
  });
}

export interface CreateSessionOpts {
  name?: string;
  title?: string;
  kind?: SessionKind;
}

/**
 * Finds an existing session with the same normalized lane signature, or
 * creates one. Does not touch `last_opened_at`.
 */
export function findOrCreateSessionByLanes(
  lanes: LaneInput[],
  opts: CreateSessionOpts = {},
): SessionRecord {
  const db = getDb();
  const sig = laneSig(lanes);
  const kind: SessionKind = opts.kind ?? (lanes.length === 0 ? 'tree' : 'diff');

  const existing = db
    .prepare('SELECT * FROM sessions WHERE lane_sig = ? AND kind = ?')
    .get(sig, kind) as SessionRow | undefined;
  if (existing) {
    return rowToSession(existing);
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const name = uniqueName(opts.name?.trim() || autoName(lanes));

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sessions (id, name, title, auto_named, lane_sig, kind, created_at, last_opened_at, archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).run(
      id,
      name,
      opts.title?.trim() || null,
      opts.name ? 0 : 1,
      sig,
      kind,
      now,
      now,
    );
    writeLanes(id, lanes);
  });
  tx();

  return getSession(id)!;
}

export function getSession(idOrName: string): SessionRecord | null {
  const db = getDb();
  let row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(idOrName) as
    | SessionRow
    | undefined;
  if (!row) {
    row = db.prepare('SELECT * FROM sessions WHERE name = ?').get(idOrName) as
      | SessionRow
      | undefined;
  }
  if (!row && idOrName.length >= 8) {
    row = db
      .prepare('SELECT * FROM sessions WHERE id LIKE ?')
      .get(`${idOrName}%`) as SessionRow | undefined;
  }
  return row ? rowToSession(row) : null;
}

export function listSessions(
  opts: { includeArchived?: boolean } = {},
): SessionRecord[] {
  const db = getDb();
  const where = opts.includeArchived ? '' : 'WHERE archived = 0';
  const rows = db
    .prepare(`SELECT * FROM sessions ${where} ORDER BY last_opened_at DESC`)
    .all() as SessionRow[];
  return rows.map(rowToSession);
}

export function setSessionLanes(
  id: string,
  lanes: LaneInput[],
): SessionRecord {
  const db = getDb();
  const session = getSession(id);
  if (!session) {
    throw new Error(`Session not found: ${id}`);
  }
  const sig = laneSig(lanes);
  const tx = db.transaction(() => {
    writeLanes(session.id, lanes);
    const patch: string[] = ['lane_sig = ?'];
    const args: unknown[] = [sig];
    if (session.autoNamed) {
      patch.push('name = ?');
      args.push(uniqueNameExcluding(autoName(lanes), session.id));
    }
    args.push(session.id);
    db.prepare(`UPDATE sessions SET ${patch.join(', ')} WHERE id = ?`).run(
      ...args,
    );
  });
  tx();
  return getSession(session.id)!;
}

function uniqueNameExcluding(base: string, sessionId: string): string {
  const db = getDb();
  const taken = new Set(
    (
      db
        .prepare('SELECT name FROM sessions WHERE id != ?')
        .all(sessionId) as { name: string }[]
    ).map((r) => r.name),
  );
  if (!taken.has(base)) {
    return base;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) {
    n++;
  }
  return `${base}-${n}`;
}

export function renameSession(
  id: string,
  patch: { name?: string; title?: string },
): SessionRecord {
  const db = getDb();
  const session = getSession(id);
  if (!session) {
    throw new Error(`Session not found: ${id}`);
  }
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?', 'auto_named = 0');
    args.push(uniqueNameExcluding(patch.name.trim(), session.id));
  }
  if (patch.title !== undefined) {
    sets.push('title = ?');
    args.push(patch.title.trim() || null);
  }
  if (sets.length > 0) {
    args.push(session.id);
    db.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).run(
      ...args,
    );
  }
  return getSession(session.id)!;
}

export function archiveSession(id: string, archived: boolean): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET archived = ? WHERE id = ?').run(
    archived ? 1 : 0,
    id,
  );
}

export function deleteSession(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM comment_threads WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

/** Marks a session as the most recently opened one. */
export function touchSession(id: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE sessions SET last_opened_at = ? WHERE id = ?').run(now, id);
  try {
    writeFileSync(currentSessionFilePath(), JSON.stringify({ id }));
  } catch {
    // best-effort compat pointer for an older globally-installed `diffity agent`
  }
}

/** The most recently opened non-archived diff session. */
export function getCurrentSession(): SessionRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM sessions
       WHERE archived = 0 AND kind = 'diff'
       ORDER BY last_opened_at DESC
       LIMIT 1`,
    )
    .get() as SessionRow | undefined;
  return row ? rowToSession(row) : null;
}

/** The last pair of a session: [base lane ref, target lane ref]. */
export function lastPair(session: SessionRecord): [string, string] | null {
  if (session.lanes.length < 2) {
    return null;
  }
  const n = session.lanes.length;
  return [session.lanes[n - 2].ref, session.lanes[n - 1].ref];
}

/**
 * Collapses a session's last pair into a legacy single-ref string understood
 * by `@diffity/git`'s `resolveDiffArgs` / `resolveRef`. Phase 1 renders only
 * this pair, so 2-lane sessions behave exactly as the old `?ref=` viewer did.
 */
export function sessionToLegacyRef(session: SessionRecord): string {
  if (session.kind === 'tree') {
    return '__tree__';
  }
  const pair = lastPair(session);
  if (!pair) {
    return 'work';
  }
  const [base, target] = pair;
  if (isWorkingTreeLaneRef(target)) {
    return base === 'HEAD' ? (target === '.' ? 'work' : target) : base;
  }
  return `${base}..${target}`;
}
