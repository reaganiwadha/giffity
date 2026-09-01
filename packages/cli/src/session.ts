import { getHeadHash } from '@diffity/git';
import { refToLanes } from './lanes.js';
import {
  findOrCreateSessionByLanes,
  getCurrentSession as getCurrentSessionRecord,
} from './sessions.js';

/**
 * Legacy single-ref session shape. Kept as a thin compatibility layer over the
 * lane-based session model (see `sessions.ts`) so `server.ts` and the
 * `/api/sessions/current` route keep working during the transition.
 */
export interface Session {
  id: string;
  ref: string;
  headHash: string;
}

export function findOrCreateSession(ref: string): Session {
  const isTree = ref === '__tree__';
  const record = findOrCreateSessionByLanes(
    isTree ? [] : refToLanes(ref),
    isTree ? { kind: 'tree' } : undefined,
  );
  return { id: record.id, ref, headHash: getHeadHash() };
}

export function getCurrentSession(): Session | null {
  const record = getCurrentSessionRecord();
  if (!record) {
    return null;
  }
  return { id: record.id, ref: record.laneSig, headHash: getHeadHash() };
}
