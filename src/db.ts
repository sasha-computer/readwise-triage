import { Database } from "bun:sqlite";
import { resolve } from "path";
import { mkdirSync } from "fs";

const DB_DIR = resolve(import.meta.dir, "../data");
const DB_PATH = resolve(DB_DIR, "readwise.db");

export function getDb(): Database {
  mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT,
      author TEXT,
      category TEXT,
      summary TEXT,
      source_url TEXT,
      image_url TEXT,
      word_count INTEGER,
      reading_time TEXT,
      saved_at TEXT,
      location TEXT,
      tags TEXT,
      synced_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS swipes (
      document_id TEXT PRIMARY KEY REFERENCES documents(id),
      action TEXT NOT NULL CHECK(action IN ('keep', 'dismiss')),
      swiped_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS summaries (
      document_id TEXT PRIMARY KEY REFERENCES documents(id),
      summary TEXT NOT NULL,
      key_points TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT REFERENCES documents(id),
      title TEXT,
      source_url TEXT,
      read_at TEXT DEFAULT (datetime('now'))
    )
  `);

  return db;
}
