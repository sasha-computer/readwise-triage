import { describe, it, expect } from "bun:test";
import { mcpCall } from "../src/readwise";

describe("readwise client", () => {
  it("throws when READWISE_TOKEN is not set", async () => {
    const original = process.env.READWISE_TOKEN;
    delete process.env.READWISE_TOKEN;

    try {
      await expect(mcpCall("reader_list_documents", {})).rejects.toThrow("READWISE_TOKEN");
    } finally {
      if (original) process.env.READWISE_TOKEN = original;
    }
  });
});
