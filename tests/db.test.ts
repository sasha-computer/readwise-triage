import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getDb } from "../src/db";
import { unlinkSync, existsSync } from "fs";
import { resolve } from "path";
import { Database } from "bun:sqlite";

const TEST_DB = resolve(import.meta.dir, "test.db");

function cleanup() {
  for (const suffix of ["", "-shm", "-wal"]) {
    const p = TEST_DB + suffix;
    if (existsSync(p)) unlinkSync(p);
  }
}

describe("database", () => {
  let db: Database;

  beforeEach(() => {
    cleanup();
    db = getDb(TEST_DB);
    // Clear all data between tests
    db.run("DELETE FROM reads");
    db.run("DELETE FROM summaries");
    db.run("DELETE FROM swipes");
    db.run("DELETE FROM documents");
  });

  afterEach(() => {
    db.close();
    cleanup();
  });

  it("creates all tables", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);

    expect(tables).toContain("documents");
    expect(tables).toContain("swipes");
    expect(tables).toContain("summaries");
    expect(tables).toContain("reads");
  });

  it("enables WAL mode", () => {
    const mode = db.prepare("PRAGMA journal_mode").get() as any;
    expect(mode.journal_mode).toBe("wal");
  });

  it("can insert and retrieve a document", () => {
    db.run(
      `INSERT INTO documents (id, title, author, category, source_url, saved_at, location, tags)
       VALUES ('doc1', 'Test Article', 'Author', 'article', 'https://example.com', '2026-01-01', 'new', '{}')`,
    );

    const doc = db.prepare("SELECT * FROM documents WHERE id = 'doc1'").get() as any;
    expect(doc.title).toBe("Test Article");
    expect(doc.author).toBe("Author");
    expect(doc.location).toBe("new");
  });

  it("upserts documents on conflict", () => {
    const upsert = db.prepare(`
      INSERT INTO documents (id, title, location) VALUES (?1, ?2, ?3)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, location=excluded.location
    `);

    upsert.run("doc1", "Original Title", "new");
    upsert.run("doc1", "Updated Title", "later");

    const doc = db.prepare("SELECT * FROM documents WHERE id = 'doc1'").get() as any;
    expect(doc.title).toBe("Updated Title");
    expect(doc.location).toBe("later");

    const count = (db.prepare("SELECT COUNT(*) as c FROM documents").get() as any).c;
    expect(count).toBe(1);
  });

  it("enforces swipe action check constraint", () => {
    db.run("INSERT INTO documents (id, title) VALUES ('doc1', 'Test')");

    // Valid actions
    db.run("INSERT INTO swipes (document_id, action) VALUES ('doc1', 'keep')");
    const swipe = db.prepare("SELECT * FROM swipes WHERE document_id = 'doc1'").get() as any;
    expect(swipe.action).toBe("keep");

    // Invalid action
    expect(() => {
      db.run("INSERT INTO swipes (document_id, action) VALUES ('doc1', 'invalid')");
    }).toThrow();
  });

  it("tracks swipe with timestamp", () => {
    db.run("INSERT INTO documents (id, title) VALUES ('doc1', 'Test')");
    db.run("INSERT INTO swipes (document_id, action) VALUES ('doc1', 'dismiss')");

    const swipe = db.prepare("SELECT * FROM swipes WHERE document_id = 'doc1'").get() as any;
    expect(swipe.swiped_at).toBeTruthy();
    expect(swipe.action).toBe("dismiss");
  });

  it("can delete a swipe (undo)", () => {
    db.run("INSERT INTO documents (id, title) VALUES ('doc1', 'Test')");
    db.run("INSERT INTO swipes (document_id, action) VALUES ('doc1', 'keep')");
    db.run("DELETE FROM swipes WHERE document_id = 'doc1'");

    const swipe = db.prepare("SELECT * FROM swipes WHERE document_id = 'doc1'").get();
    expect(swipe).toBeNull();
  });

  it("stores and retrieves summaries", () => {
    db.run("INSERT INTO documents (id, title) VALUES ('doc1', 'Test')");
    db.run(
      `INSERT INTO summaries (document_id, summary, key_points) VALUES ('doc1', 'A great article.', '["point 1","point 2"]')`,
    );

    const summary = db.prepare("SELECT * FROM summaries WHERE document_id = 'doc1'").get() as any;
    expect(summary.summary).toBe("A great article.");
    expect(JSON.parse(summary.key_points)).toEqual(["point 1", "point 2"]);
  });

  it("tracks reads with auto-incrementing id", () => {
    db.run("INSERT INTO documents (id, title) VALUES ('doc1', 'Test')");
    db.run("INSERT INTO reads (document_id, title, source_url) VALUES ('doc1', 'Test', 'https://example.com')");
    db.run("INSERT INTO reads (document_id, title, source_url) VALUES ('doc1', 'Test', 'https://example.com')");

    const reads = db.prepare("SELECT * FROM reads ORDER BY id").all() as any[];
    expect(reads).toHaveLength(2);
    expect(reads[0].id).toBe(1);
    expect(reads[1].id).toBe(2);
  });

  it("queries unswiped documents correctly", () => {
    db.run("INSERT INTO documents (id, title, saved_at) VALUES ('doc1', 'First', '2026-01-01')");
    db.run("INSERT INTO documents (id, title, saved_at) VALUES ('doc2', 'Second', '2026-01-02')");
    db.run("INSERT INTO documents (id, title, saved_at) VALUES ('doc3', 'Third', '2026-01-03')");
    db.run("INSERT INTO swipes (document_id, action) VALUES ('doc2', 'keep')");

    const unswiped = db
      .prepare(
        `SELECT d.* FROM documents d
         LEFT JOIN swipes s ON s.document_id = d.id
         WHERE s.document_id IS NULL
         ORDER BY d.saved_at DESC`,
      )
      .all() as any[];

    expect(unswiped).toHaveLength(2);
    expect(unswiped[0].title).toBe("Third");
    expect(unswiped[1].title).toBe("First");
  });

  it("counts unswiped documents", () => {
    db.run("INSERT INTO documents (id, title) VALUES ('doc1', 'First')");
    db.run("INSERT INTO documents (id, title) VALUES ('doc2', 'Second')");
    db.run("INSERT INTO swipes (document_id, action) VALUES ('doc1', 'dismiss')");

    const result = db
      .prepare(
        `SELECT COUNT(*) as count FROM documents d
         LEFT JOIN swipes s ON s.document_id = d.id
         WHERE s.document_id IS NULL`,
      )
      .get() as any;

    expect(result.count).toBe(1);
  });

  it("is idempotent - calling getDb twice on same path works", () => {
    db.close();
    const db1 = getDb(TEST_DB);
    const db2 = getDb(TEST_DB);

    db1.run("INSERT INTO documents (id, title) VALUES ('doc1', 'Test')");
    const doc = db2.prepare("SELECT * FROM documents WHERE id = 'doc1'").get() as any;
    expect(doc.title).toBe("Test");

    db1.close();
    db2.close();
    db = getDb(TEST_DB); // re-open for afterEach cleanup
  });
});
