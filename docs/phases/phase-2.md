# Phase 2 — Recall UI, lane picker, ref listing, smarter CLI dispatch

**Goal:** see/reopen/name sessions and build lane pipelines from the browser;
`diffity <refs>` reuses a running server instead of erroring or spawning.

Depends on: Phase 1.

## `packages/git/src/refs.ts` (new, export from `index.ts`)

- [x] `getBranches(): { name; isCurrent; upstream? }[]` (`git for-each-ref refs/heads`)
- [x] `getTags(): string[]` (`git for-each-ref refs/tags`, `-creatordate`)
- [x] `getHeadInfo(): { branch; hash; shortHash; detached }`
- [x] reuse `getRecentCommits` for the commit list
- [x] `packages/git/tests/refs.test.ts` against this repo

## API

- [x] `GET /api/refs` → `{ head, branches, tags, recentCommits, workingTreeRefs }`
- [x] `POST /api/control { action:'open-session', lanes, name?, title? }` →
      find-or-create + `touchSession` → `{ id, name, url:"/diff?session=<id>" }`
      (single entry point shared by CLI dispatch and MCP)
- [x] `RegistryEntry` carries `activeSessionId` (set on `/api/control`); `list`
      command shows the session name

## UI

- [x] `routes/_index.tsx` → real dashboard (or add `routes/sessions.tsx`;
      `_index` → `/sessions` when sessions exist, else `/diff`)
- [x] `components/session/session-list.tsx` — cards: title/name, lane pills,
      relative `last_opened_at` (dayjs), open/total thread counts, Open /
      Archive / Edit lanes
- [x] `components/session/lane-picker.tsx` — ordered, drag-reorderable lane rows;
      add/remove; validation banner ("only the last lane can be working-tree",
      "need ≥ 2 lanes"); prefill lane 0 = default branch, last = `work`
- [x] `components/session/ref-combobox.tsx` — grouped combobox (Branches / Tags /
      Recent commits / Working tree) fed by `/api/refs`
- [x] `queries/sessions.ts`, `queries/refs.ts`, `hooks/use-sessions.ts`
- [x] `lib/api.ts`: `fetchSessions`, `fetchSession`, `createSession`,
      `updateSession`, `archiveSession`, `fetchRefs`, `openSession`
- [x] `routes/diff.tsx` `clientLoader`: accept `?session=<id>`; if only `?ref=`,
      resolve to a session and redirect to `?session=<id>`; return `{ session, … }`.
      `DiffPage` still renders one pair (last) this phase.

## Smarter CLI dispatch — `packages/cli/src/index.ts`

- [x] compute `lanes` from `refs` via `lanes.ts` (shared helper)
- [x] if `findInstanceForRepo` healthy and not `--new`:
      `POST http://localhost:<port>/api/control` then `open(url)` — **no spawn**;
      print "reused instance"
- [x] else `startServer(...)`, create the session from a new `initialLanes`
      option in the `listening` handler + `touchSession`, open `/diff?session=<id>`
- [x] `--new` kills + restarts as today
- [x] `packages/cli/src/commands/sessions.ts` — `diffity sessions`,
      `diffity sessions open <name>` (mirrors `commands/open.ts`)

## Verify

- [x] two shells: `diffity main` then `diffity HEAD~2` → same instance, second
      session card appears on the dashboard; edit-lanes reorders; archive hides
- [x] kill instance, `diffity` cold-starts onto a session URL
