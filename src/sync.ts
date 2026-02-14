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

async function syncLocation(location: string, db: ReturnType<typeof getDb>) {
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
    const res = await listDocuments(location, 100, cursor, SYNC_FIELDS);
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
    console.log(`  ${location}: synced ${total} docs${cursor ? ", fetching more..." : ""}`);
  } while (cursor);

  return total;
}

async function main() {
  console.log("Syncing Readwise library...");
  const db = getDb();

  let grand = 0;
  for (const loc of ["new", "later", "shortlist"]) {
    grand += await syncLocation(loc, db);
  }

  console.log(`\nSync complete. ${grand} documents indexed.`);
  db.close();
}

main().catch((err) => {
  console.error("Sync failed:", err.message);
  process.exit(1);
});
