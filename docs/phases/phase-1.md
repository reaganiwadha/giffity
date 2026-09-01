# Phase 1 — Session model redesign

**Goal:** many named, DB-backed sessions, each with an ordered lane list. UI is
untouched — it keeps working through a `?ref=` → session compat shim (still
single-pair). CLI/MCP get a deterministic "current session".

Depends on: Phase 0.

## Migration 2

- [ ] `sessions` table: `id PK, name NOT NULL, title, auto_named DEFAULT 1,
      lane_sig NOT NULL, kind DEFAULT 'diff', created_at, last_opened_at,
      archived DEFAULT 0`; index on `last_opened_at DESC`.
- [ ] `session_lanes` table: `session_id → sessions(id) ON DELETE CASCADE,
      position, ref, label, PRIMARY KEY (session_id, position)`.
- [ ] Rebuild `comment_threads` and `tours` to re-point the `session_id` FK at
      `sessions` (`CREATE …_new`, `INSERT … SELECT`, drop, rename, recreate
      indexes) — inside the migration transaction.
- [ ] Data migration: per `review_sessions` row create a `sessions` row
      **reusing the same id**, preserve `created_at`, `last_opened_at =
      created_at`. Lanes derived from `ref` via `lanes.ts` (below).
- [ ] `name` auto-derived from lanes, de-duped with `-2`, `-3` … suffix.
- [ ] Leave `review_sessions` in place, unwritten, for rollback (dropped
      post-Phase-4).

## New: `packages/cli/src/lanes.ts`

- [ ] `refToLanes(ref: string): { ref: string; label?: string }[]`
  - `a..b` / `a...b` → `[a, b]` (keep `...` semantics downstream)
  - `work` | `staged` | `unstaged` | `.` → `['HEAD', ref]` (`.` → `work`)
  - `__tree__` → `[]` (caller sets `kind = 'tree'`)
  - other committish `X` → `['X', 'work']`
- [ ] `laneSig(lanes): string` — normalized (`trim`, `.`→`work`) join with ` → `.
- [ ] `autoName(lanes): string`.

## New: `packages/cli/src/sessions.ts`

- [ ] `findOrCreateSessionByLanes(lanes, opts?) ` — match on `lane_sig`
- [ ] `getSession(idOrName)`, `listSessions({ includeArchived? })`
- [ ] `setSessionLanes(id, lanes)`, `renameSession(id, {name?, title?})`,
      `archiveSession(id, archived)`
- [ ] `touchSession(id)` — `last_opened_at = now`; also write
      `~/.diffity/<hash>/current-session` as `{ id }` (older installed `agent`)
- [ ] `getCurrentSession()` — `MAX(last_opened_at) WHERE archived = 0 AND
      kind = 'diff'`
- [ ] Reimplement `session.ts` `findOrCreateSession(ref)` as a thin shim:
      `refToLanes(ref)` → `findOrCreateSessionByLanes`. `server.ts` untouched
      this phase.

## New: `packages/cli/src/session-routes.ts`

Wired into `server.ts` alongside `handleReviewRoute`.

- [ ] `GET /api/sessions` → list + `{ openThreadCount, totalThreadCount }` per
      session (one grouped query)
- [ ] `GET /api/sessions/:id` → record incl. lanes
- [ ] `POST /api/sessions { lanes:[{ref,label?}], name?, title? }` — validate
      each ref (`isValidGitRef` or `WORKING_TREE_REFS`); ≥ 2 lanes; only the
      **last** lane may be a working-tree ref
- [ ] `PATCH /api/sessions/:id { lanes?, name?, title?, archived? }`
- [ ] `DELETE /api/sessions/:id` — archive; `?hard=1` deletes + cascades
- [ ] `GET /api/threads?session=` also accepts a session **name**
- [ ] `GET /api/diff?session=<id>` → resolves to the session's **last pair**
      (identical output to today for 2-lane sessions)
- [ ] `/api/info`: drop the `findOrCreateSession(ref)` side-effect; accept
      `?session=<id>` returning that session's id/name/lanes

## `packages/cli/src/agent.ts`

- [ ] `requireSession()` resolution: `--session <id|name>` global option →
      `getCurrentSession()` → error
- [ ] Replace `session.ref` uses (`agent diff`, `agent comment` file-in-diff
      check) with last-lane / last-pair logic
- [ ] Add `--author <name>` (default `Agent`)

## Verify

- [ ] `packages/cli/tests/sessions.test.ts`:
  - migration 2 on a seeded legacy DB → every row migrated, threads still
    resolve, thread counts preserved after the FK rebuild
  - `lane_sig` find-or-create idempotency
  - `getCurrentSession` ordering by `last_opened_at`
- [ ] Manual: existing repo still shows old comments; `diffity agent list` and
      `diffity agent list --session <name>` work.

## Risk

The `comment_threads` / `tours` FK table rebuild. Test on a real `reviews.db`
copy before landing. `review_sessions` retained for rollback.
