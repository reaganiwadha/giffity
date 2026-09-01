# Phase 2 — Recall UI, lane picker, ref listing, smarter CLI dispatch

**Goal:** see/reopen/name sessions and build lane pipelines from the browser;
`diffity <refs>` reuses a running server instead of erroring or spawning.

Depends on: Phase 1.

## `packages/git/src/refs.ts` (new, export from `index.ts`)

- [ ] `getBranches(): { name; isCurrent; upstream? }[]` (`git for-each-ref refs/heads`)
- [ ] `getTags(): string[]` (`git for-each-ref refs/tags`, `-creatordate`)
- [ ] `getHeadInfo(): { branch; hash; shortHash; detached }`
- [ ] reuse `getRecentCommits` for the commit list
- [ ] `packages/git/tests/refs.test.ts` against this repo

## API

- [ ] `GET /api/refs` → `{ head, branches, tags, recentCommits, workingTreeRefs }`
- [ ] `POST /api/control { action:'open-session', lanes, name?, title? }` →
      find-or-create + `touchSession` → `{ id, name, url:"/diff?session=<id>" }`
      (single entry point shared by CLI dispatch and MCP)
- [ ] `RegistryEntry` carries `activeSessionId` (set on `/api/control`); `list`
      command shows the session name

## UI

- [ ] `routes/_index.tsx` → real dashboard (or add `routes/sessions.tsx`;
      `_index` → `/sessions` when sessions exist, else `/diff`)
- [ ] `components/session/session-list.tsx` — cards: title/name, lane pills,
      relative `last_opened_at` (dayjs), open/total thread counts, Open /
      Archive / Edit lanes
- [ ] `components/session/lane-picker.tsx` — ordered, drag-reorderable lane rows;
      add/remove; validation banner ("only the last lane can be working-tree",
      "need ≥ 2 lanes"); prefill lane 0 = default branch, last = `work`
- [ ] `components/session/ref-combobox.tsx` — grouped combobox (Branches / Tags /
      Recent commits / Working tree) fed by `/api/refs`
- [ ] `queries/sessions.ts`, `queries/refs.ts`, `hooks/use-sessions.ts`
- [ ] `lib/api.ts`: `fetchSessions`, `fetchSession`, `createSession`,
      `updateSession`, `archiveSession`, `fetchRefs`, `openSession`
- [ ] `routes/diff.tsx` `clientLoader`: accept `?session=<id>`; if only `?ref=`,
      resolve to a session and redirect to `?session=<id>`; return `{ session, … }`.
      `DiffPage` still renders one pair (last) this phase.

## Smarter CLI dispatch — `packages/cli/src/index.ts`

- [ ] compute `lanes` from `refs` via `lanes.ts` (shared helper)
- [ ] if `findInstanceForRepo` healthy and not `--new`:
      `POST http://localhost:<port>/api/control` then `open(url)` — **no spawn**;
      print "reused instance"
- [ ] else `startServer(...)`, create the session from a new `initialLanes`
      option in the `listening` handler + `touchSession`, open `/diff?session=<id>`
- [ ] `--new` kills + restarts as today
- [ ] `packages/cli/src/commands/sessions.ts` — `diffity sessions`,
      `diffity sessions open <name>` (mirrors `commands/open.ts`)

## Verify

- [ ] two shells: `diffity main` then `diffity HEAD~2` → same instance, second
      session card appears on the dashboard; edit-lanes reorders; archive hides
- [ ] kill instance, `diffity` cold-starts onto a session URL
