import type { ChunkingStrategy } from "@/lib/chunker";
import type { RetrievalMode } from "@/lib/types";

export interface EvalDocument {
  name: string;
  text: string;
}

export interface EvalQuestion {
  id: string;
  document: string;
  kind: "lexical" | "paraphrase";
  question: string;
  gold_quotes: string[];
}

export interface JudgeControl {
  id: string;
  expect_faithful: boolean;
  question: string;
  answer: string;
  sources: string[];
}

export interface KindScores {
  n: number;
  recall_at_5: number;
  mrr: number;
}

export interface EvalRow {
  chunking: ChunkingStrategy;
  retriever: RetrievalMode;
  chunks: number;
  n: number;
  recall_at_1: number;
  recall_at_5: number;
  mrr: number;
  faithfulness: number | null;
  citation_accuracy: number;
  judge_errors: number;
  by_kind: Record<string, KindScores>;
}

export interface EvalReport {
  mode: "offline-fixture" | "live";
  live: boolean;
  generated_at: string;
  note: string;
  embedder: string;
  full_text: string;
  reranker: string;
  judge: {
    name: string;
    prompt: string;
    limits: string[];
  };
  ranking_depth: number;
  answer_sources: number;
  rrf_k: number;
  vector_threshold: number;
  questions: number;
  definitions: {
    recall_at_k: string;
    mrr: string;
    citation_accuracy: string;
    faithfulness: string;
  };
  judge_controls: {
    accuracy: number;
    n: number;
    errors: number;
  };
  results: EvalRow[];
}
