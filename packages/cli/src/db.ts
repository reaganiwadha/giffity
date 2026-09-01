import Database from 'better-sqlite3';
import { join } from 'node:path';
import { getDiffityDir } from '@diffity/git';
import { runMigrations } from './migrations.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = join(getDiffityDir(), 'reviews.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Test-only: swap the process-wide connection for an in-memory database.
 * Pass `null` to reset.
 */
export function setDbForTesting(instance: Database.Database | null): void {
  db = instance;
}
