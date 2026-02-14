import { getDocumentDetails } from "./readwise";

function getOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY environment variable is not set");
  return key;
}

export async function getDocContent(documentId: string): Promise<string> {
  const data = await getDocumentDetails(documentId);
  return data.content || data.summary || "";
}

export async function summarize(
  title: string,
  content: string,
): Promise<{ summary: string; keyPoints: string[] }> {
  const key = getOpenRouterKey();
  const truncated = content.slice(0, 12_000);

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            'You summarize articles concisely. Return valid JSON only, no markdown fences. Format: {"summary":"2-3 sentence summary","keyPoints":["point 1","point 2","point 3"]}. 3-5 key points max. Be direct and specific.',
        },
        {
          role: "user",
          content: `Title: ${title}\n\n${truncated}`,
        },
      ],
      temperature: 0.3,
    }),
  });

  const data = (await res.json()) as any;
  const text = data.choices?.[0]?.message?.content || "";

  try {
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary || text,
      keyPoints: parsed.keyPoints || [],
    };
  } catch {
    // If the raw text looks like it contains JSON, try to extract fields
    const summaryMatch = text.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const keyPointsMatch = text.match(/"keyPoints"\s*:\s*\[([^\]]*)\]/);
    if (summaryMatch) {
      const keyPoints = keyPointsMatch
        ? keyPointsMatch[1].match(/"((?:[^"\\]|\\.)*)"/g)?.map(s => s.slice(1, -1)) || []
        : [];
      return { summary: summaryMatch[1].replace(/\\"/g, '"'), keyPoints };
    }
    return { summary: text, keyPoints: [] };
  }
}
