import { createHash } from 'node:crypto';
import { getDiffStatForRef } from '@diffity/git';
import { getDb } from './db.js';
import { publish, subscribedSessionIds } from './events.js';
import { isWorkingTreeLaneRef } from './lanes.js';
import { getSession, sessionToLegacyRef } from './sessions.js';

const INTERVAL_MS = 3000;
const diffFingerprints = new Map<string, string>();
const threadFingerprints = new Map<string, string>();

function diffFingerprint(id: string): string | null {
  const session = getSession(id);
  if (!session || session.kind !== 'diff') {
    return null;
  }
  // Only sessions whose last pair targets the working tree can go stale.
  if (!session.lanes.some((lane) => isWorkingTreeLaneRef(lane.ref))) {
    return null;
  }
  const stat = getDiffStatForRef(sessionToLegacyRef(session));
  return createHash('sha1').update(stat).digest('hex').slice(0, 12);
}

function threadFingerprint(id: string): string {
  const row = getDb()
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM comment_threads WHERE session_id = ?) AS threads,
         (SELECT COALESCE(MAX(updated_at), '') FROM comment_threads WHERE session_id = ?) AS updated,
         (SELECT COUNT(*) FROM comments c
            JOIN comment_threads t ON t.id = c.thread_id
            WHERE t.session_id = ?) AS comments`,
    )
    .get(id, id, id) as { threads: number; updated: string; comments: number };
  return `${row.threads}:${row.comments}:${row.updated}`;
}

/**
 * One server-side timer (gated on live SSE subscribers). Replaces the
 * per-browser `/api/diff-fingerprint` poll and also catches review-comment
 * writes made by out-of-process `diffity agent` commands, which cannot reach
 * the in-process event bus.
 */
export function startDiffWatcher(): () => void {
  const timer = setInterval(() => {
    for (const id of subscribedSessionIds()) {
      try {
        const df = diffFingerprint(id);
        if (df !== null) {
          const prev = diffFingerprints.get(id);
          diffFingerprints.set(id, df);
          if (prev !== undefined && prev !== df) {
            publish({ type: 'diff:stale', sessionId: id });
          }
        }

        const tf = threadFingerprint(id);
        const prevT = threadFingerprints.get(id);
        threadFingerprints.set(id, tf);
        if (prevT !== undefined && prevT !== tf) {
          publish({ type: 'thread:updated', sessionId: id });
        }
      } catch {
        // transient error — try again next tick
      }
    }
  }, INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
