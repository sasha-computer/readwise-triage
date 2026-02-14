import { getDb } from "./db";
import { listDocuments } from "./readwise";

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

function getLastSyncTime(db: ReturnType<typeof getDb>): string | null {
  const row = db.prepare("SELECT MAX(synced_at) as last_sync FROM documents").get() as any;
  return row?.last_sync || null;
}

async function syncLocation(location: string, db: ReturnType<typeof getDb>, updatedAfter?: string | null) {
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

async function main() {
  const db = getDb();
  const lastSync = getLastSyncTime(db);

  if (lastSync) {
    console.log(`Incremental sync (changes since ${lastSync})...`);
  } else {
    console.log("Full sync (first run)...");
  }

  let grand = 0;
  for (const loc of ["new", "later", "shortlist"]) {
    grand += await syncLocation(loc, db, lastSync);
  }

  if (grand > 0) {
    console.log(`\nSync complete. ${grand} documents updated.`);
  } else {
    console.log("Already up to date.");
  }
  db.close();
}

main().catch((err) => {
  console.error("Sync failed:", err.message);
  process.exit(1);
});
