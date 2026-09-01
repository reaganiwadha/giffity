# Phase 0 — Migration runner

**Goal:** replace the idempotent DDL blob in `db.ts` with a numbered-migration
runner, so every later phase can evolve the schema safely for users who already
have a `reviews.db`. No behaviour change.

## Tasks

- [ ] Add `packages/cli/src/migrations.ts`
  - [ ] `interface Migration { version: number; name: string; up(db: Database.Database): void }`
  - [ ] `export const migrations: Migration[]`
  - [ ] `export function runMigrations(db)`: create
        `schema_migrations(version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT DEFAULT (datetime('now')))`,
        read `MAX(version)`, run each `migrations[].version > current` inside
        `db.transaction(() => { m.up(db); insert row })`, ordered by version.
- [ ] Migration **1 — baseline**: the exact current `CREATE TABLE IF NOT EXISTS …`
      text from `migrateDb()` (`review_sessions`, `comment_threads`, `comments`,
      their indexes, `tours`, `tour_steps`). Idempotent — existing DBs no-op it
      and get stamped version 1.
- [ ] `packages/cli/src/db.ts`: call `runMigrations(db)` instead of `migrateDb`;
      delete the inline `migrateDb` function.
- [ ] Test setup for `packages/cli`:
  - [ ] add `vitest` devDep + `"test": "vitest run"` script
  - [ ] wire into root `package.json` `test` script
- [ ] `packages/cli/tests/migrations.test.ts`:
  - [ ] `runMigrations` twice on a `better-sqlite3` `:memory:` db → second run is
        a no-op
  - [ ] `schema_migrations` contains row `version = 1`
  - [ ] all legacy tables + indexes exist

## Verify

- `npm run test -w diffity` green.
- Manual: point `getDiffityDir` at a copy of a real `~/.diffity/<hash>/` dir, run
  `diffity`, confirm it boots and existing comments render.

## Done when

`npm run build` + `npm run test` green; a fresh DB and a legacy DB both end at
schema version 1 with identical structure.
