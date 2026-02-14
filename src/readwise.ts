/**
 * Readwise Reader API client.
 * Talks to the Readwise MCP server over HTTP (JSON-RPC + SSE).
 */

const MCP_URL = "https://mcp2.readwise.io/mcp";

function getToken(): string {
  const token = process.env.READWISE_TOKEN;
  if (!token) throw new Error("READWISE_TOKEN environment variable is not set");
  return token;
}

interface McpResult {
  results?: any[];
  nextPageCursor?: string;
  [key: string]: any;
}

export async function mcpCall(tool: string, params: Record<string, unknown>): Promise<McpResult> {
  const token = getToken();

  const payload = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: { name: tool, arguments: params },
    id: "call-1",
  };

  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();

  // Parse SSE response: lines starting with "data: "
  const dataLines = raw
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6).trim());

  for (const line of dataLines) {
    if (!line) continue;
    const msg = JSON.parse(line);

    if (msg.error) {
      throw new Error(`Readwise MCP error: ${JSON.stringify(msg.error)}`);
    }

    const result = msg.result || {};

    if (result.isError) {
      const errorText = (result.content || [])
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
      throw new Error(`Readwise tool error: ${errorText}`);
    }

    // Prefer structuredContent, fall back to text content
    if (result.structuredContent != null) {
      return result.structuredContent;
    }

    for (const item of result.content || []) {
      if (item.type === "text") {
        try {
          return JSON.parse(item.text);
        } catch {
          return { text: item.text } as any;
        }
      }
    }
  }

  throw new Error("No valid response from Readwise MCP");
}

export async function listDocuments(
  location: string,
  limit: number = 100,
  cursor?: string | null,
  fields?: string[],
): Promise<{ results: any[]; nextPageCursor: string | null }> {
  const params: Record<string, unknown> = { location, limit };
  if (cursor) params.page_cursor = cursor;
  if (fields) params.response_fields = fields;

  const res = await mcpCall("reader_list_documents", params);
  return {
    results: res.results || [],
    nextPageCursor: (res.nextPageCursor as string) || null,
  };
}

export async function moveDocument(documentId: string, location: string): Promise<void> {
  await mcpCall("reader_move_document", { document_id: documentId, location });
}

export async function getDocumentDetails(documentId: string): Promise<{ content: string; summary?: string }> {
  const res = await mcpCall("reader_get_document_details", { document_id: documentId });
  return { content: res.content || res.summary || "", summary: res.summary };
}
