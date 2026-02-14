import { getDb } from "./db";
import { listDocuments } from "./readwise";
import type { Database } from "bun:sqlite";

const SYNC_FIELDS = [
  "title",
  "author",
  "category",
  "summary",
  "source_url",
  "image_url",
  "word_count",
  "reading_time",
  "saved_at",
  "tags",
];

function getLastSyncTime(db: Database): string | null {
  const row = db.prepare("SELECT MAX(synced_at) as last_sync FROM documents").get() as any;
  return row?.last_sync || null;
}

async function syncLocation(location: string, db: Database, updatedAfter?: string | null) {
  let cursor: string | null = null;
  let total = 0;

  const upsert = db.prepare(`
    INSERT INTO documents (id, title, author, category, summary, source_url, image_url, word_count, reading_time, saved_at, location, tags, synced_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, author=excluded.author, category=excluded.category,
      summary=excluded.summary, source_url=excluded.source_url, image_url=excluded.image_url,
      word_count=excluded.word_count, reading_time=excluded.reading_time,
      saved_at=excluded.saved_at, location=excluded.location, tags=excluded.tags,
      synced_at=datetime('now')
  `);

  do {
    const res = await listDocuments(location, 100, cursor, SYNC_FIELDS, updatedAfter);
    const docs = res.results || [];

    for (const doc of docs) {
      const tags = doc.tags ? JSON.stringify(doc.tags) : "{}";
      upsert.run(
        doc.id,
        doc.title,
        doc.author,
        doc.category,
        doc.summary,
        doc.source_url,
        doc.image_url,
        doc.word_count,
        doc.reading_time,
        doc.saved_at,
        location,
        tags,
      );
    }

    total += docs.length;
    cursor = res.nextPageCursor || null;
    if (docs.length > 0) {
      console.log(`  ${location}: synced ${total} docs${cursor ? ", fetching more..." : ""}`);
    }
  } while (cursor);

  return total;
}

/** Sync Readwise Reader library to local DB. Returns number of docs updated. */
export async function syncLibrary(db: Database): Promise<{ updated: number; incremental: boolean }> {
  const lastSync = getLastSyncTime(db);
  const incremental = !!lastSync;

  if (incremental) {
    console.log(`Incremental sync (changes since ${lastSync})...`);
  } else {
    console.log("Full sync (first run)...");
  }

  let updated = 0;
  for (const loc of ["new", "later", "shortlist"]) {
    updated += await syncLocation(loc, db, lastSync);
  }

  if (updated > 0) {
    console.log(`Sync complete. ${updated} documents updated.`);
  } else {
    console.log("Already up to date.");
  }

  return { updated, incremental };
}

// CLI entrypoint
if (import.meta.main) {
  const db = getDb();
  syncLibrary(db)
    .then(() => db.close())
    .catch((err) => {
      console.error("Sync failed:", err.message);
      process.exit(1);
    });
}
