import type { IncomingMessage, ServerResponse } from 'node:http';
import { isValidGitRef } from '@diffity/git';
import { getDb } from './db.js';
import { isWorkingTreeLaneRef, type LaneInput } from './lanes.js';
import {
  archiveSession,
  deleteSession,
  findOrCreateSessionByLanes,
  getSession,
  listSessions,
  renameSession,
  setSessionLanes,
  touchSession,
  type SessionRecord,
} from './sessions.js';
import { sendError, sendJson, withJsonBody } from './http-utils.js';

interface ThreadCounts {
  openThreadCount: number;
  totalThreadCount: number;
}

function threadCounts(): Map<string, ThreadCounts> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT session_id,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open
       FROM comment_threads
       GROUP BY session_id`,
    )
    .all() as { session_id: string; total: number; open: number }[];
  const map = new Map<string, ThreadCounts>();
  for (const r of rows) {
    map.set(r.session_id, {
      openThreadCount: r.open,
      totalThreadCount: r.total,
    });
  }
  return map;
}

function withCounts(session: SessionRecord) {
  const counts = threadCounts().get(session.id);
  return {
    ...session,
    openThreadCount: counts?.openThreadCount ?? 0,
    totalThreadCount: counts?.totalThreadCount ?? 0,
  };
}

/** Returns an error message, or null if the lane list is valid. */
function validateLanes(lanes: LaneInput[]): string | null {
  if (!Array.isArray(lanes) || lanes.length < 2) {
    return 'A session needs at least 2 lanes';
  }
  for (let i = 0; i < lanes.length; i++) {
    const ref = String(lanes[i]?.ref ?? '').trim();
    if (!ref) {
      return `Lane ${i} is missing a ref`;
    }
    const isWorkingTree = isWorkingTreeLaneRef(ref);
    if (isWorkingTree && i !== lanes.length - 1) {
      return `Only the last lane may be a working-tree ref (got "${ref}" at position ${i})`;
    }
    if (!isWorkingTree && !isValidGitRef(ref)) {
      return `"${ref}" is not a valid git ref`;
    }
  }
  return null;
}

function normalizeLaneInput(raw: unknown): LaneInput[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((l) => {
    const obj = (l ?? {}) as Record<string, unknown>;
    return {
      ref: String(obj.ref ?? '').trim(),
      label:
        typeof obj.label === 'string' && obj.label.trim()
          ? obj.label.trim()
          : undefined,
    };
  });
}

export function handleSessionRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  url: URL,
): boolean {
  if (pathname === '/api/sessions' && req.method === 'GET') {
    const includeArchived = url.searchParams.get('archived') === '1';
    const sessions = listSessions({ includeArchived }).map(withCounts);
    sendJson(res, { sessions });
    return true;
  }

  if (pathname === '/api/sessions' && req.method === 'POST') {
    withJsonBody(res, req, 'Failed to create session', (body) => {
      const lanes = normalizeLaneInput(body.lanes);
      const err = validateLanes(lanes);
      if (err) {
        sendError(res, 400, err);
        return;
      }
      const session = findOrCreateSessionByLanes(lanes, {
        name: typeof body.name === 'string' ? body.name : undefined,
        title: typeof body.title === 'string' ? body.title : undefined,
      });
      sendJson(res, withCounts(session));
    });
    return true;
  }

  const idMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (idMatch) {
    const idOrName = decodeURIComponent(idMatch[1]);

    if (req.method === 'GET') {
      const session = getSession(idOrName);
      if (!session) {
        sendError(res, 404, `Session not found: ${idOrName}`);
        return true;
      }
      sendJson(res, withCounts(session));
      return true;
    }

    if (req.method === 'PATCH') {
      withJsonBody(res, req, 'Failed to update session', (body) => {
        const session = getSession(idOrName);
        if (!session) {
          sendError(res, 404, `Session not found: ${idOrName}`);
          return;
        }
        let current = session;
        if (body.lanes !== undefined) {
          const lanes = normalizeLaneInput(body.lanes);
          const err = validateLanes(lanes);
          if (err) {
            sendError(res, 400, err);
            return;
          }
          current = setSessionLanes(current.id, lanes);
        }
        if (
          typeof body.name === 'string' ||
          typeof body.title === 'string'
        ) {
          current = renameSession(current.id, {
            name: typeof body.name === 'string' ? body.name : undefined,
            title: typeof body.title === 'string' ? body.title : undefined,
          });
        }
        if (typeof body.archived === 'boolean') {
          archiveSession(current.id, body.archived);
          current = getSession(current.id)!;
        }
        sendJson(res, withCounts(current));
      });
      return true;
    }

    if (req.method === 'DELETE') {
      const session = getSession(idOrName);
      if (!session) {
        sendError(res, 404, `Session not found: ${idOrName}`);
        return true;
      }
      if (url.searchParams.get('hard') === '1') {
        deleteSession(session.id);
      } else {
        archiveSession(session.id, true);
      }
      sendJson(res, { ok: true });
      return true;
    }
  }

  return false;
}

export { touchSession };
