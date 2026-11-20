import { Bm25Index, searchableText } from "@/lib/eval/lexical";
import type { ChunkHit } from "@/lib/retrieval";

function dot(left: number[], right: number[]): number {
  let score = 0;
  for (let index = 0; index < left.length; index += 1) {
    score += left[index] * right[index];
  }
  return score;
}

export class MemoryIndex {
  private readonly byId = new Map<string, ChunkHit>();
  private readonly bm25: Bm25Index;

  constructor(
    private readonly chunks: ChunkHit[],
    private readonly vectors: number[][]
  ) {
    if (chunks.length !== vectors.length) {
      throw new Error("Embedding count does not match chunk count");
    }
    for (const chunk of chunks) this.byId.set(chunk.id, chunk);
    this.bm25 = new Bm25Index(
      chunks.map((chunk) => ({ id: chunk.id, text: searchableText(chunk) }))
    );
  }

  vectorSearch(query: number[], limit: number, threshold: number): ChunkHit[] {
    return this.chunks
      .map((chunk, index) => ({ chunk, score: dot(query, this.vectors[index]) }))
      .filter((entry) => entry.score > threshold)
      .sort(
        (a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id)
      )
      .slice(0, limit)
      .map((entry) => ({
        ...entry.chunk,
        similarity: entry.score,
        text_rank: null,
      }));
  }

  textSearch(query: string, limit: number): ChunkHit[] {
    return this.bm25.search(query, limit).map((hit) => {
      const chunk = this.byId.get(hit.id);
      if (!chunk) throw new Error(`Missing chunk ${hit.id}`);
      return { ...chunk, similarity: null, text_rank: hit.score };
    });
  }
}
