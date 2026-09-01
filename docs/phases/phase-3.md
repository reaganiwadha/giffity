# Phase 3 — SSE live updates

**Goal:** GUI updates instantly when the CLI/MCP mutates comments or lanes, and
when the working tree changes. Drop client polling (keep a fallback).

Depends on: Phase 1 (Phase 2 recommended first).

## `packages/cli/src/events.ts` (new)

- [ ] module-singleton `EventEmitter`
- [ ] `publish(evt: DiffityEvent)`, `subscribe(sessionId, listener): () => void`
      (listener also gets global / no-session events)
- [ ] event types: `thread:created`, `thread:updated`, `thread:deleted`,
      `comment:added`, `session:created`, `session:lanes-changed`,
      `session:archived`, `diff:stale`

## Endpoint (in `server.ts`, before the static fallback)

- [ ] `GET /api/events?session=<id>` — `Content-Type: text/event-stream`,
      `Cache-Control: no-cache`, `Connection: keep-alive`, flush headers, write
      `retry: 3000\n\n`, `data: <json>\n\n` per event, 15s heartbeat `:\n\n`,
      unsubscribe + clear timer on `req.close`

## Publishers

- [ ] `review-routes.ts` publishes after each successful thread/comment mutation
      (it knows the session; keeps `threads.ts` pure)
- [ ] `session-routes.ts` publishes `session:*`
- [ ] `packages/cli/src/diff-watcher.ts` (new): one 3s server timer, only for
      sessions with ≥ 1 live SSE subscriber; recompute the last-pair fingerprint
      (per-pair in Phase 4) and `publish({ type:'diff:stale', sessionId })` on
      change

## UI

- [ ] `hooks/use-session-events.ts` (new) — one `EventSource` per open session:
  - `thread:*` / `comment:*` → invalidate `['threads', sessionId]`
  - `session:lanes-changed` → invalidate `['session', id]` + `['diff', …]`
  - `diff:stale` → set a flag consumed by `StaleDiffBanner`
  - `onerror` → EventSource auto-reconnects; after N failures fall back to a 5s
    refetch
- [ ] `use-review-threads.ts` `refetchInterval` → `false`
- [ ] `use-diff-staleness.ts` / `use-tree-staleness.ts` consume the event; keep
      the one-shot baseline fetch + 5s fallback when `window.EventSource` is
      absent/erroring
- [ ] keep `/api/diff-fingerprint` + `/api/tree/fingerprint` (fallback + tests)
- [ ] wire `use-session-events` once at `DiffPage` level

## Verify

- [ ] `packages/cli/tests/events.test.ts` — subscribe receives publish; session
      filtering; unsubscribe stops delivery
- [ ] Manual: session in two tabs, `diffity agent comment` from CLI → both update
      ~1s; Network shows one persistent `/api/events` and no repeating
      `/api/threads` / `/api/diff-fingerprint`
- [ ] Manual: edit a file on disk → stale banner via SSE
