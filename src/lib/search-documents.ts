import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { formatContext } from "@/lib/grounding";
import { createLlmReranker } from "@/lib/rerank";
import {
  noopReranker,
  resolveRetrievalMode,
  retrieve,
  wantsRerank,
  type ChunkHit,
} from "@/lib/retrieval";
import { supabaseAdmin } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/embeddings";
import type { RetrievalMode, SearchResult } from "@/lib/types";

interface VectorRow {
  id: string;
  content: string;
  heading: string | null;
  document_name: string;
  chunk_index: number;
  similarity: number;
}

interface FtsRow {
  id: string;
  content: string;
  heading: string | null;
  document_name: string;
  chunk_index: number;
  rank: number;
}

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function toHit(row: VectorRow | FtsRow, kind: "vector" | "fts"): ChunkHit {
  return {
    id: row.id,
    content: row.content,
    heading: row.heading,
    document_name: row.document_name,
    chunk_index: row.chunk_index,
    similarity: kind === "vector" ? (row as VectorRow).similarity : null,
    text_rank: kind === "fts" ? (row as FtsRow).rank : null,
  };
}

function toSearchResult(hit: ChunkHit): SearchResult {
  return {
    content: hit.content,
    heading: hit.heading,
    document_name: hit.document_name,
    chunk_index: hit.chunk_index,
    similarity: hit.similarity,
  };
}

let missingKeyWarned = false;

function buildReranker() {
  if (!process.env.OPENAI_API_KEY) {
    if (!missingKeyWarned) {
      missingKeyWarned = true;
      console.warn("Rerank requested but OPENAI_API_KEY is missing; using fused order.");
    }
    return noopReranker;
  }

  return createLlmReranker(async (prompt) => {
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      temperature: 0,
      prompt,
    });
    return text;
  });
}

function logTextSearchError(error: unknown): void {
  const message = error instanceof Error ? error.message : "full-text search failed";
  console.warn(`Full-text search unavailable; using vector results only. ${message}`);
}

export async function vectorSearch(
  embedding: number[],
  limit: number,
  threshold: number
): Promise<ChunkHit[]> {
  const { data, error } = await supabaseAdmin.rpc("match_documents", {
    query_embedding: JSON.stringify(embedding),
    match_threshold: threshold,
    match_count: limit,
  });
  if (error) throw new Error(error.message);
  return rows<VectorRow>(data).map((row) => toHit(row, "vector"));
}

export async function textSearch(query: string, limit: number): Promise<ChunkHit[]> {
  const { data, error } = await supabaseAdmin.rpc("search_documents_fts", {
    query_text: query,
    match_count: limit,
  });
  if (error) throw new Error(error.message);
  return rows<FtsRow>(data).map((row) => toHit(row, "fts"));
}

export async function retrieveForApp(
  query: string,
  limit: number,
  mode: RetrievalMode = resolveRetrievalMode(process.env.RETRIEVAL_MODE)
): Promise<{ results: SearchResult[]; context: string }> {
  const rerankEnabled = process.env.RERANK_ENABLED === "true";
  const hits = await retrieve(
    query,
    { mode, limit, rerankEnabled },
    {
      embedQuery: generateEmbedding,
      vectorSearch,
      textSearch,
      reranker: wantsRerank(mode, rerankEnabled) ? buildReranker() : noopReranker,
      onTextSearchError: logTextSearchError,
    }
  );

  const results = hits.map(toSearchResult);
  return { results, context: formatContext(results) };
}
