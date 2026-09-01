import { WORKING_TREE_REFS } from '@diffity/git';

export interface LaneInput {
  ref: string;
  label?: string;
}

/**
 * The working-tree pseudo-refs, ordered from "most complete" to "least" so a
 * bare committish can be paired sensibly with `work`.
 */
export const WORKING_TREE_LANE_REFS = ['work', 'staged', 'unstaged'] as const;

/** Trims and canonicalizes a lane ref (`.` → `work`). */
export function normalizeLaneRef(ref: string): string {
  const trimmed = ref.trim();
  return trimmed === '.' ? 'work' : trimmed;
}

const normalizeRefToken = normalizeLaneRef;

/**
 * Derives an ordered lane list from a legacy single-ref string. Used by the
 * `?ref=` compatibility shim and the Phase 1 data migration.
 *
 * - `a..b` / `a...b`          -> `[a, b]`
 * - `work` | `staged` | `unstaged` | `.` -> `['HEAD', ref]`
 * - `__tree__`               -> `[]` (caller sets kind = 'tree')
 * - any other committish `X` -> `['X', 'work']`
 */
export function refToLanes(ref: string): LaneInput[] {
  const value = normalizeRefToken(ref);

  if (value === '__tree__') {
    return [];
  }

  const threeDot = value.indexOf('...');
  if (threeDot !== -1) {
    return [
      { ref: value.slice(0, threeDot) },
      { ref: value.slice(threeDot + 3) },
    ];
  }

  const twoDot = value.indexOf('..');
  if (twoDot !== -1) {
    return [
      { ref: value.slice(0, twoDot) },
      { ref: value.slice(twoDot + 2) },
    ];
  }

  if (WORKING_TREE_REFS.has(value)) {
    return [{ ref: 'HEAD' }, { ref: value }];
  }

  return [{ ref: value }, { ref: 'work' }];
}

/**
 * A normalized, stable signature for a lane pipeline. Used as the
 * find-or-create key so `diffity main..HEAD` twice reuses one session.
 */
export function laneSig(lanes: LaneInput[]): string {
  return lanes.map((l) => normalizeRefToken(l.ref)).join(' → ');
}

/** Auto-derived session name from a lane pipeline, e.g. `main → work`. */
export function autoName(lanes: LaneInput[]): string {
  if (lanes.length === 0) {
    return 'tree';
  }
  if (lanes.length === 1) {
    return normalizeRefToken(lanes[0].ref);
  }
  return lanes.map((l) => normalizeRefToken(l.ref)).join(' → ');
}

export function isWorkingTreeLaneRef(ref: string): boolean {
  return WORKING_TREE_REFS.has(normalizeRefToken(ref));
}
