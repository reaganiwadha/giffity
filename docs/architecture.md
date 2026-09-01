# giffity architecture

This document describes the target architecture the phase docs build toward. It
supersedes the "one server per repo, one session per ref" model of upstream
diffity.

## Processes

- **HTTP server** — one `node:http` server per repo (`packages/cli/src/server.ts`),
  registered in `~/.diffity/registry.json` with its port, pid and
  `activeSessionId`. Serves the built UI as static files and the `/api/*`
  surface. Started by `diffity` (or lazily by the MCP server).
- **CLI** (`packages/cli/src/index.ts` + `commands/*`) — thin. When a healthy
  instance already exists for the repo it **dispatches** (`POST /api/control`)
  instead of spawning a second server.
- **MCP server** (`packages/cli/src/mcp/`, `diffity mcp`) — a stdio MCP server
  for coding-agent configs. On first tool call it ensures an HTTP server is
  running for the cwd repo (reuse via the registry, else spawn one), then drives
  it over the local `/api` surface. Authors comments as its own identity
  (default `Claude Code`).

## Data model

SQLite, one file per repo at `~/.diffity/<sha256(repoRoot)[:12]>/reviews.db`.
Schema evolves through numbered migrations (`packages/cli/src/migrations.ts`,
tracked in `schema_migrations`).

### `sessions`

A session is what a single browser tab is looking at. It has a stable id, a
name (auto-derived from its lanes, human-renamable via `title`), a `kind`
(`diff` | `tree`), `last_opened_at` (drives "current session" for the CLI/MCP),
and an `archived` flag. `lane_sig` is a normalized join of the lane refs used as
the find-or-create key so `diffity main..HEAD` twice reuses one session.

### `session_lanes`

Ordered rows (`position`, `ref`, optional `label`) belonging to a session.
`ref` is a committish (`main`, `v1.0.0`, `abc1234`, `HEAD~2`) or a working-tree
ref (`work`, `staged`, `unstaged`). Only the **last** lane may be a working-tree
ref.

### Pairs

A session with N lanes has **N-1 pairs**. Pair `i` diffs `lane[i]` (base)
against `lane[i+1]` (target) — a pairwise pipeline. `giffity main HEAD~1 work`
→ lanes `[main, HEAD~1, work]` → pairs `main→HEAD~1` (0) and `HEAD~1→work` (1).
The UI shows one tab per pair. A 2-lane session has exactly pair 0 and renders
identically to upstream diffity.

### `comment_threads` / `comments`

Threads anchor to `(session_id, pair_index, file_path, side, start_line,
end_line)`. `file_path = '__general__'` for diff-wide comments. Comments carry
`author_name` + `author_type` (`user` | `agent`); MCP and CLI-agent comments are
`agent` and thread inline with human replies.

## Live updates

`packages/cli/src/events.ts` is an in-process event bus. Mutations publish
(`thread:*`, `comment:added`, `session:*`, `diff:stale`). The UI subscribes via
one `EventSource` per open session (`GET /api/events?session=<id>`) and
invalidates the relevant TanStack Query keys. A single server-side
`diff-watcher` timer (gated on live subscribers) replaces per-browser
fingerprint polling. Client polling remains only as a fallback when
`EventSource` is unavailable.

## Diff engine

Unchanged approach: shell out to `git diff`, parse with `@diffity/parser` (pure
TS, shared with the UI). New: `resolvePairDiffArgs(base, target)` in
`packages/git/src/diff.ts` handles an arbitrary committish base against a
committish or working-tree target.
