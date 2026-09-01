# Phase 5 — MCP server

**Goal:** `diffity mcp` — an MCP stdio server for coding-agent configs that
drives the local HTTP API and auto-starts/reuses the per-repo server.

Depends on: Phases 1–4.

## Placement

`packages/cli/src/mcp/`, **not a new workspace** — it needs `registry.ts`,
`lanes.ts`, `@diffity/git`; the esbuild bundle already produces one entrypoint;
the optional single-exe (deferred) wants one entrypoint.

- [ ] add deps to `packages/cli/package.json`: `@modelcontextprotocol/sdk`
      (+ esbuild `external` + runtime dep), `zod` (bundles fine)

## Files

- [ ] `mcp/index.ts` — `registerMcpCommand(program)` adds hidden `diffity mcp`;
      `McpServer` + `StdioServerTransport`
- [ ] `mcp/http-client.ts` — `class DiffityClient` `fetch` wrapper over the
      Phase 1–4 endpoints; injects author identity
- [ ] `mcp/ensure-server.ts` — `ensureServer(cwd): Promise<{ baseUrl }>`
  - repo root/hash from cwd (`git -C cwd rev-parse --show-toplevel`)
  - `findInstanceForRepo(repoHash)` + `checkInstanceHealth`
  - if none: `spawn(process.execPath, [selfPath, '--no-open', '--quiet'],
    { cwd, detached: true, stdio: 'ignore' }).unref()`; poll health ≤ 10s
  - called lazily on first tool use
  - guard concurrent calls with an in-process promise cache keyed by `repoHash`
- [ ] `mcp/tools.ts` — zod-validated tools + handlers

## Tools

| Tool | Input | HTTP |
|---|---|---|
| `list_sessions` | `{ includeArchived? }` | `GET /api/sessions` |
| `create_session` | `{ lanes[min 2], name?, title? }` | `POST /api/sessions` |
| `switch_session` | `{ sessionId?, name? }` | `POST /api/control` + touch |
| `set_lanes` | `{ sessionId, lanes }` | `PATCH /api/sessions/:id` |
| `open_in_browser` | `{ sessionId }` | MCP calls `open(url)` directly + touch |
| `get_diff` | `{ sessionId, pairIndex?, path? }` | `GET /api/diff` (trim to `path`) |
| `list_comments` | `{ sessionId, pairIndex?, status? }` | `GET /api/threads` |
| `add_comment` | `{ sessionId, pairIndex, file, side, startLine, endLine?, body }` | `POST /api/threads` |
| `reply_comment` | `{ threadId, body }` | `POST /api/threads/:id/reply` |
| `resolve_comment` | `{ threadId, summary? }` | `PATCH /api/threads/:id/status` |
| `dismiss_comment` | `{ threadId, reason? }` | `PATCH /api/threads/:id/status` |

`pull_pr` deferred to a later phase.

## Author identity

- [ ] MCP sends `author: { name: process.env.DIFFITY_MCP_AUTHOR ?? 'Claude Code',
      type: 'agent' }` — a real author row, so replies interleave in threads with
      the agent badge
- [ ] add optional `author` to `PATCH /api/threads/:id/status` so resolve/dismiss
      summaries are attributed too
- SSE (Phase 3) already reflects every MCP mutation live in open browser tabs

## Skills / docs

- [ ] update `packages/skills/{diffity-review,diffity-resolve}/SKILL.md` to
      prefer MCP tools with a `diffity agent` fallback; regenerate `SKILLS_HASH`
      (`scripts/build-skills.ts`)
- [ ] document `claude mcp add diffity -- diffity mcp`

## Verify

- [ ] `packages/cli/tests/mcp-tools.test.ts` — in-process HTTP server on an
      ephemeral port, temp repo + temp `~/.diffity`, exercise each tool handler
- [ ] `ensure-server` test — no instance → spawns → health green → second call
      reuses
- [ ] Manual: add to a real Claude Code; "review main..HEAD" → session opens in
      browser, comments it adds show live, its replies thread inline under human
      comments

## Risk

Double-spawn race if two tool calls hit `ensureServer` concurrently — the
in-process promise cache + the registry file lock cover it.
