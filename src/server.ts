import { getDb } from "./db";
import { summarize, getDocContent } from "./summarize";
import { moveDocument } from "./readwise";
import { readFileSync } from "fs";
import { resolve } from "path";

const PORT = parseInt(process.env.PORT || "3141");
const db = getDb();

// Precompile statements
const getNextDoc = db.prepare(`
  SELECT d.* FROM documents d
  LEFT JOIN swipes s ON s.document_id = d.id
  WHERE s.document_id IS NULL
  ORDER BY d.saved_at DESC
  LIMIT 1 OFFSET ?1
`);

const getUnswiped = db.prepare(`
  SELECT COUNT(*) as count FROM documents d
  LEFT JOIN swipes s ON s.document_id = d.id
  WHERE s.document_id IS NULL
`);

const insertSwipe = db.prepare(`
  INSERT OR REPLACE INTO swipes (document_id, action) VALUES (?1, ?2)
`);

const deleteSwipe = db.prepare(`
  DELETE FROM swipes WHERE document_id = ?1
`);

const getLastSwipe = db.prepare(`
  SELECT s.*, d.title FROM swipes s
  JOIN documents d ON d.id = s.document_id
  ORDER BY s.swiped_at DESC
  LIMIT 1
`);

const insertSummary = db.prepare(`
  INSERT OR REPLACE INTO summaries (document_id, summary, key_points) VALUES (?1, ?2, ?3)
`);

const getSummary = db.prepare(`
  SELECT * FROM summaries WHERE document_id = ?1
`);

const insertRead = db.prepare(`
  INSERT INTO reads (document_id, title, source_url) VALUES (?1, ?2, ?3)
`);

const getRecentReads = db.prepare(`
  SELECT title, read_at FROM reads ORDER BY read_at DESC LIMIT 20
`);

async function moveInReadwise(documentId: string, location: string) {
  try {
    await moveDocument(documentId, location);
  } catch (e) {
    console.error(`Failed to move ${documentId} to ${location}:`, e);
  }
}

function serveStatic(path: string): Response {
  try {
    const filePath = resolve(import.meta.dir, "../public", path);
    const content = readFileSync(filePath);
    const ext = path.split(".").pop();
    const types: Record<string, string> = {
      html: "text/html; charset=utf-8",
      css: "text/css",
      js: "application/javascript",
      svg: "image/svg+xml",
    };
    return new Response(content, {
      headers: { "Content-Type": types[ext || "html"] || "application/octet-stream" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/next") {
      const offset = parseInt(url.searchParams.get("offset") || "0");
      const doc = getNextDoc.get(offset) as any;
      const remaining = (getUnswiped.get() as any)?.count || 0;
      if (!doc) return Response.json({ doc: null, remaining: 0 });
      return Response.json({ doc, remaining });
    }

    if (url.pathname === "/api/swipe" && req.method === "POST") {
      const { documentId, action } = await req.json() as any;
      insertSwipe.run(documentId, action);

      // dismiss = archive, keep = shortlist
      const location = action === "dismiss" ? "archive" : "shortlist";
      moveInReadwise(documentId, location);

      return Response.json({ ok: true });
    }

    if (url.pathname === "/api/undo" && req.method === "POST") {
      const last = getLastSwipe.get() as any;
      if (!last) return Response.json({ ok: false, error: "Nothing to undo" });

      deleteSwipe.run(last.document_id);

      // Move back to inbox in Readwise
      moveInReadwise(last.document_id, "new");

      return Response.json({ ok: true, title: last.title });
    }

    if (url.pathname === "/api/read" && req.method === "POST") {
      const { documentId, title, sourceUrl } = await req.json() as any;
      insertRead.run(documentId, title, sourceUrl);
      return Response.json({ ok: true });
    }

    if (url.pathname === "/api/reads") {
      const reads = getRecentReads.all();
      return Response.json(reads);
    }

    if (url.pathname === "/api/summarize" && req.method === "POST") {
      const { documentId, title } = await req.json() as any;

      const cached = getSummary.get(documentId) as any;
      if (cached) {
        return Response.json({
          summary: cached.summary,
          keyPoints: JSON.parse(cached.key_points || "[]"),
        });
      }

      const content = await getDocContent(documentId);
      const result = await summarize(title, content);
      insertSummary.run(documentId, result.summary, JSON.stringify(result.keyPoints));

      return Response.json(result);
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return serveStatic("index.html");
    }
    return serveStatic(url.pathname.slice(1));
  },
});

console.log(`Readwise Triage running at http://localhost:${PORT}`);
