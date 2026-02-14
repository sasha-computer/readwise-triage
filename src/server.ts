import { getDb } from "./db";
import { summarize, getDocContent } from "./summarize";
import { moveDocument } from "./readwise";
import { syncLibrary } from "./sync";
import { readFileSync } from "fs";
import { resolve } from "path";
import PocketBase from "pocketbase";

const PORT = parseInt(process.env.PORT || "3141");
const PB_URL = process.env.POCKETBASE_URL || "http://localhost:8090";
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL || "900000"); // 15 min
const db = getDb();

// Sync state
let syncing = false;
let lastSyncAt: string | null = null;
let lastSyncCount = 0;

async function runSync(): Promise<{ updated: number; error?: string }> {
  if (syncing) return { updated: 0, error: "Sync already in progress" };
  syncing = true;
  try {
    const result = await syncLibrary(db);
    lastSyncAt = new Date().toISOString();
    lastSyncCount = result.updated;
    return { updated: result.updated };
  } catch (e: any) {
    console.error("Sync failed:", e.message);
    return { updated: 0, error: e.message };
  } finally {
    syncing = false;
  }
}

// Background sync timer
setInterval(() => {
  console.log("Background sync starting...");
  runSync();
}, SYNC_INTERVAL);

// Initial sync on boot
runSync().then(r => console.log(`Initial sync: ${r.updated} docs`));

async function validateAuth(req: Request): Promise<boolean> {
  const cookies = req.headers.get("cookie") || "";
  const match = cookies.match(/pb_token=([^;]+)/);
  if (!match) return false;

  try {
    const pb = new PocketBase(PB_URL);
    pb.authStore.save(match[1], null);
    // Validate token by refreshing auth
    await pb.collection("users").authRefresh();
    return pb.authStore.isValid;
  } catch {
    return false;
  }
}

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

    // Serve login page and PB config without auth
    if (url.pathname === "/login" || url.pathname === "/login.html") {
      const html = readFileSync(resolve(import.meta.dir, "../public/login.html"), "utf-8");
      const injected = html.replace(
        "window.__PB_URL__ || window.location.origin.replace(/:\\d+$/, ':8090')",
        `'${PB_URL}'`,
      );
      return new Response(injected, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Auth check for everything else
    const authed = await validateAuth(req);
    if (!authed) {
      // API routes get 401, pages get redirected
      if (url.pathname.startsWith("/api/")) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      return Response.redirect(new URL("/login", req.url).toString(), 302);
    }

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

    if (url.pathname === "/api/sync" && req.method === "POST") {
      const result = await runSync();
      return Response.json(result);
    }

    if (url.pathname === "/api/sync-status") {
      return Response.json({ syncing, lastSyncAt, lastSyncCount });
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

    if (url.pathname === "/logout") {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/login",
          "Set-Cookie": "pb_token=; path=/; max-age=0",
        },
      });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return serveStatic("index.html");
    }
    return serveStatic(url.pathname.slice(1));
  },
});

console.log(`Readwise Triage running at http://localhost:${PORT}`);
