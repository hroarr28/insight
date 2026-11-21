import { describe, expect, it } from "vitest";
import {
  resolveRetrievalMode,
  retrieve,
  wantsRerank,
  type ChunkHit,
} from "@/lib/retrieval";

function hit(id: string, similarity: number | null = null): ChunkHit {
  return {
    id,
    content: id,
    heading: null,
    document_name: "doc",
    chunk_index: 0,
    similarity,
    text_rank: null,
  };
}

describe("retrieval policy", () => {
  it("defaults to hybrid and keeps an explicit mode", () => {
    expect(resolveRetrievalMode(undefined)).toBe("hybrid");
    expect(resolveRetrievalMode("nope")).toBe("hybrid");
    expect(resolveRetrievalMode("vector")).toBe("vector");
  });

  it("reranks only when the mode or the flag asks for it", () => {
    expect(wantsRerank("vector", true)).toBe(false);
    expect(wantsRerank("hybrid", false)).toBe(false);
    expect(wantsRerank("hybrid", true)).toBe(true);
    expect(wantsRerank("hybrid-rerank", false)).toBe(true);
  });
});

describe("retrieve", () => {
  const vectorHits = [hit("a", 0.9), hit("b", 0.8)];
  const textHits = [
    { ...hit("b"), text_rank: 0.4 },
    { ...hit("c"), text_rank: 0.2 },
  ];

  function deps(overrides: Partial<Parameters<typeof retrieve>[2]> = {}) {
    return {
      embedQuery: async () => [1, 0],
      vectorSearch: async () => vectorHits,
      textSearch: async () => textHits,
      ...overrides,
    };
  }

  it("fuses vector and full-text rankings", async () => {
    const ranked = await retrieve("query", { mode: "hybrid", limit: 3, candidates: 3 }, deps());
    expect(ranked.map((chunk) => chunk.id)).toEqual(["b", "a", "c"]);
    expect(ranked[0].similarity).toBe(0.8);
    expect(ranked[0].text_rank).toBe(0.4);
    expect(ranked[2].similarity).toBeNull();
  });

  it("does not call full-text search in vector mode", async () => {
    let called = false;
    const ranked = await retrieve(
      "query",
      { mode: "vector", limit: 2, candidates: 2 },
      deps({
        textSearch: async () => {
          called = true;
          return textHits;
        },
      })
    );
    expect(called).toBe(false);
    expect(ranked.map((chunk) => chunk.id)).toEqual(["a", "b"]);
  });

  it("falls back to the vector list when full-text search throws", async () => {
    let logged = false;
    const ranked = await retrieve(
      "query",
      { mode: "hybrid", limit: 2, candidates: 2 },
      deps({
        textSearch: async () => {
          throw new Error("function search_documents_fts does not exist");
        },
        onTextSearchError: () => {
          logged = true;
        },
      })
    );
    expect(logged).toBe(true);
    expect(ranked.map((chunk) => chunk.id)).toEqual(["a", "b"]);
  });

  it("uses the reranker order and keeps fusion when the reranker throws", async () => {
    const reranked = await retrieve(
      "query",
      { mode: "hybrid-rerank", limit: 2, candidates: 3 },
      deps({
        reranker: {
          name: "reverse",
          async rerank(_query, chunks, limit) {
            return [...chunks].reverse().slice(0, limit);
          },
        },
      })
    );
    expect(reranked.map((chunk) => chunk.id)).toEqual(["c", "a"]);

    const fallback = await retrieve(
      "query",
      { mode: "hybrid-rerank", limit: 3, candidates: 3 },
      deps({
        reranker: {
          name: "broken",
          async rerank() {
            throw new Error("rerank failed");
          },
        },
      })
    );
    expect(fallback.map((chunk) => chunk.id)).toEqual(["b", "a", "c"]);
  });
});
