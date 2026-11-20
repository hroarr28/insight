import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCachedEmbedder } from "@/lib/eval/embedding-cache";
import type { Embedder } from "@/lib/eval/lexical";

describe("createCachedEmbedder", () => {
  it("embeds each distinct text once and reuses the file on the next run", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "insight-embed-"));
    const filePath = path.join(directory, "embeddinggemma.json");
    let calls = 0;
    const inner: Embedder = {
      name: "ollama:embeddinggemma",
      async embed(texts) {
        calls += 1;
        return texts.map((_, index) => [calls, index, texts.length]);
      },
    };

    const first = createCachedEmbedder(inner, filePath, 3, { batchSize: 8 });
    const vectors = await first.embed(["alpha", "beta", "alpha"]);
    expect(calls).toBe(1);
    expect(vectors[0]).toEqual(vectors[2]);

    const second = createCachedEmbedder(inner, filePath, 3, { batchSize: 8 });
    const again = await second.embed(["beta", "alpha"]);
    expect(calls).toBe(1);
    expect(again[1]).toEqual(vectors[0]);
    expect(again[0]).toEqual(vectors[1]);
  });
});
