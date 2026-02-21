/**
 * Import Readwise Reader documents from local SQLite into Karakeep.
 *
 * Usage: bun run src/import-to-karakeep.ts [--dry-run]
 */

import { Database } from "bun:sqlite";
import { resolve } from "path";

const DB_PATH = resolve(import.meta.dir, "../data/readwise.db");
const KARAKEEP_URL = "https://bookmarks.sasha.computer/api/v1";
const KARAKEEP_API_KEY = process.env.KARAKEEP_API_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const DELAY_MS = 300;

if (!KARAKEEP_API_KEY) {
  console.error("KARAKEEP_API_KEY environment variable is required");
  process.exit(1);
}

interface Doc {
  id: string;
  title: string | null;
  author: string | null;
  category: string | null;
  summary: string | null;
  source_url: string | null;
  saved_at: string | null;
  location: string | null;
  tags: string | null;
}

interface ImportResult {
  readwise_id: string;
  karakeep_id: string | null;
  status: "created" | "exists" | "skipped" | "error";
  error?: string;
}

async function karakeepFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${KARAKEEP_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${KARAKEEP_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

async function createBookmark(doc: Doc): Promise<{ id: string; alreadyExists: boolean }> {
  const body: Record<string, unknown> = {
    type: "link",
    url: doc.source_url,
  };

  if (doc.title) body.title = doc.title;
  if (doc.summary) body.summary = doc.summary;
  if (doc.saved_at) body.createdAt = doc.saved_at;
  if (doc.location === "archive") body.archived = true;

  const res = await karakeepFetch("/bookmarks", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (res.status === 200) {
    // Already exists
    return { id: data.id, alreadyExists: true };
  }

  if (res.status === 201) {
    return { id: data.id, alreadyExists: false };
  }

  throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
}

async function attachTags(bookmarkId: string, tagNames: string[]): Promise<void> {
  const tags = tagNames.map((name) => ({ tagName: name }));
  const res = await karakeepFetch(`/bookmarks/${bookmarkId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags }),
  });

  if (!res.ok) {
    const data = await res.text();
    throw new Error(`Tag attach failed: HTTP ${res.status}: ${data}`);
  }
}

function buildTags(doc: Doc): string[] {
  const tags: string[] = ["from-readwise"];

  if (doc.category) {
    tags.push(`readwise-${doc.category}`);
  }

  if (doc.location) {
    tags.push(doc.location === "new" ? "readwise-inbox" : `readwise-${doc.location}`);
  }

  // Parse any Readwise tags
  if (doc.tags && doc.tags !== "{}") {
    try {
      const parsed = JSON.parse(doc.tags);
      if (typeof parsed === "object") {
        for (const key of Object.keys(parsed)) {
          if (key) tags.push(key);
        }
      }
    } catch {}
  }

  return tags;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const db = new Database(DB_PATH, { readonly: true });

  // Create imports tracking table in a separate DB to avoid modifying the original
  const trackDb = new Database(resolve(import.meta.dir, "../data/imports.db"));
  trackDb.run("PRAGMA journal_mode = WAL");
  trackDb.run(`
    CREATE TABLE IF NOT EXISTS imports (
      readwise_id TEXT PRIMARY KEY,
      karakeep_id TEXT,
      status TEXT,
      imported_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const alreadyImported = new Set<string>();
  for (const row of trackDb.prepare("SELECT readwise_id FROM imports WHERE status IN ('created', 'exists')").all() as { readwise_id: string }[]) {
    alreadyImported.add(row.readwise_id);
  }

  const docs = db.prepare(`
    SELECT id, title, author, category, summary, source_url, saved_at, location, tags
    FROM documents
    WHERE source_url IS NOT NULL AND source_url != ''
    ORDER BY saved_at ASC
  `).all() as Doc[];

  console.log(`Found ${docs.length} documents with URLs`);
  console.log(`Already imported: ${alreadyImported.size}`);
  if (DRY_RUN) console.log("DRY RUN -- no changes will be made\n");

  const upsert = trackDb.prepare(`
    INSERT INTO imports (readwise_id, karakeep_id, status)
    VALUES (?1, ?2, ?3)
    ON CONFLICT(readwise_id) DO UPDATE SET
      karakeep_id=excluded.karakeep_id, status=excluded.status, imported_at=datetime('now')
  `);

  let created = 0;
  let exists = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];

    if (alreadyImported.has(doc.id)) {
      skipped++;
      continue;
    }

    const tags = buildTags(doc);
    const prefix = `[${i + 1}/${docs.length}]`;

    if (DRY_RUN) {
      console.log(`${prefix} Would import: ${doc.title || doc.source_url} (${tags.join(", ")})`);
      continue;
    }

    try {
      const result = await createBookmark(doc);

      if (result.alreadyExists) {
        console.log(`${prefix} EXISTS: ${doc.title || doc.source_url}`);
        upsert.run(doc.id, result.id, "exists");
        exists++;
      } else {
        console.log(`${prefix} CREATED: ${doc.title || doc.source_url}`);
        upsert.run(doc.id, result.id, "created");
        created++;
      }

      // Attach tags regardless (idempotent)
      await attachTags(result.id, tags);

      await sleep(DELAY_MS);
    } catch (err: any) {
      console.error(`${prefix} ERROR: ${doc.title || doc.source_url}: ${err.message}`);
      upsert.run(doc.id, null, "error");
      errors++;
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nDone!`);
  console.log(`  Created: ${created}`);
  console.log(`  Already existed: ${exists}`);
  console.log(`  Skipped (previously imported): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  db.close();
  trackDb.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
