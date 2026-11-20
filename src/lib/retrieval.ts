import { reciprocalRankFusion } from "@/lib/rrf";
import type { RetrievalMode } from "@/lib/types";

export interface ChunkHit {
  id: string;
  content: string;
  heading: string | null;
  document_name: string;
  chunk_index: number;
  similarity: number | null;
  text_rank: number | null;
  rrf_score?: number;
}

export interface Reranker {
  readonly name: string;
  rerank(query: string, chunks: ChunkHit[], limit: number): Promise<ChunkHit[]>;
}

export const DEFAULT_RRF_K = 60;
export const DEFAULT_VECTOR_THRESHOLD = 0.3;
export const DEFAULT_CANDIDATE_COUNT = 20;

export const noopReranker: Reranker = {
  name: "none",
  async rerank(_query, chunks, limit) {
    return chunks.slice(0, limit);
  },
};

export function wantsRerank(mode: RetrievalMode, rerankEnabled: boolean): boolean {
  if (mode === "vector") return false;
  if (mode === "hybrid-rerank") return true;
  return rerankEnabled;
}

export function resolveRetrievalMode(value: string | undefined): RetrievalMode {
  if (value === "vector" || value === "hybrid" || value === "hybrid-rerank") {
    return value;
  }
  return "hybrid";
}

export interface RetrieveDeps {
  embedQuery: (text: string) => Promise<number[]>;
  vectorSearch: (
    embedding: number[],
    limit: number,
    threshold: number
  ) => Promise<ChunkHit[]>;
  textSearch: (query: string, limit: number) => Promise<ChunkHit[]>;
  reranker?: Reranker;
  onTextSearchError?: (error: unknown) => void;
}

export interface RetrieveOptions {
  mode: RetrievalMode;
  limit: number;
  candidates?: number;
  threshold?: number;
  rrfK?: number;
  rerankEnabled?: boolean;
}

function copyHit(hit: ChunkHit): ChunkHit {
  return { ...hit };
}

function mergeHit(existing: ChunkHit, incoming: ChunkHit): ChunkHit {
  return {
    ...existing,
    similarity: existing.similarity ?? incoming.similarity,
    text_rank: existing.text_rank ?? incoming.text_rank,
    heading: existing.heading ?? incoming.heading,
  };
}

export function fuseHits(rankings: ChunkHit[][], k = DEFAULT_RRF_K): ChunkHit[] {
  const byId = new Map<string, ChunkHit>();
  for (const ranking of rankings) {
    for (const hit of ranking) {
      const previous = byId.get(hit.id);
      byId.set(hit.id, previous ? mergeHit(previous, hit) : copyHit(hit));
    }
  }

  const fused = reciprocalRankFusion(
    rankings.map((ranking) => ranking.map((hit) => hit.id)),
    k
  );

  return fused.map((entry) => {
    const hit = byId.get(entry.id);
    if (!hit) {
      throw new Error(`Fused id ${entry.id} was missing from the candidate lists`);
    }
    return { ...hit, rrf_score: entry.score };
  });
}

/**
 * Vector search is required. Full-text search is best-effort: if it throws
 * (for example the migration is not applied yet), the vector list is used alone.
 * Rerank failures stay inside the reranker and preserve the fused order.
 */
export async function retrieve(
  query: string,
  options: RetrieveOptions,
  deps: RetrieveDeps
): Promise<ChunkHit[]> {
  const limit = options.limit;
  const pool = options.candidates ?? Math.max(limit, DEFAULT_CANDIDATE_COUNT);
  const threshold = options.threshold ?? DEFAULT_VECTOR_THRESHOLD;
  const rrfK = options.rrfK ?? DEFAULT_RRF_K;
  const reranker = deps.reranker ?? noopReranker;

  const textPromise =
    options.mode === "vector"
      ? Promise.resolve({ hits: [] as ChunkHit[], failed: false })
      : deps
          .textSearch(query, pool)
          .then((hits) => ({ hits, failed: false }))
          .catch((error: unknown) => {
            deps.onTextSearchError?.(error);
            return { hits: [] as ChunkHit[], failed: true };
          });

  const embedding = await deps.embedQuery(query);
  const vectorHits = await deps.vectorSearch(embedding, pool, threshold);
  const text = await textPromise;

  const ranked =
    options.mode === "vector" || text.failed
      ? vectorHits.map((hit) => ({ ...hit }))
      : fuseHits([vectorHits, text.hits], rrfK);

  const candidates = ranked.slice(0, pool);
  const rerank = wantsRerank(options.mode, options.rerankEnabled ?? false);
  if (!rerank) return candidates.slice(0, limit);
  try {
    return await reranker.rerank(query, candidates, limit);
  } catch {
    return candidates.slice(0, limit);
  }
}
