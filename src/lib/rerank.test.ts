import { describe, expect, it } from "vitest";
import { createLlmReranker, parseRerankScores } from "@/lib/rerank";
import type { ChunkHit } from "@/lib/retrieval";

function hit(id: string): ChunkHit {
  return {
    id,
    content: id,
    heading: null,
    document_name: "doc",
    chunk_index: 0,
    similarity: null,
    text_rank: null,
  };
}

describe("parseRerankScores", () => {
  it("reads a fenced score list", () => {
    const raw = "```json\n{\"scores\":[{\"index\":0,\"score\":1},{\"index\":1,\"score\":9}]}\n```";
    expect(parseRerankScores(raw, 2)).toEqual([1, 9]);
  });

  it("returns null when fewer than half the passages are scored", () => {
    expect(parseRerankScores('{"scores":[{"index":0,"score":1}]}', 4)).toBeNull();
    expect(parseRerankScores("not json", 2)).toBeNull();
  });
});

describe("createLlmReranker", () => {
  const chunks = [hit("a"), hit("b")];

  it("orders passages by the returned scores", async () => {
    const reranker = createLlmReranker(async () =>
      JSON.stringify({
        scores: [
          { index: 0, score: 1 },
          { index: 1, score: 9 },
        ],
      })
    );
    const ranked = await reranker.rerank("query", chunks, 2);
    expect(ranked.map((chunk) => chunk.id)).toEqual(["b", "a"]);
  });

  it("keeps the original order when the model call fails", async () => {
    const reranker = createLlmReranker(async () => {
      throw new Error("model down");
    });
    const ranked = await reranker.rerank("query", chunks, 2);
    expect(ranked.map((chunk) => chunk.id)).toEqual(["a", "b"]);
  });
});
