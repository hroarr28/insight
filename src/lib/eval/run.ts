import { CHUNKING_STRATEGIES, chunkWithStrategy, type ChunkingStrategy } from "@/lib/chunker";
import type { Embedder } from "@/lib/eval/lexical";
import { MemoryIndex } from "@/lib/eval/memory-index";
import { citationAccuracy, mean, recallAtK, reciprocalRank } from "@/lib/eval/metrics";
import {
  FAITHFULNESS_JUDGE_LIMITS,
  FAITHFULNESS_JUDGE_PROMPT,
  type FaithfulnessJudge,
} from "@/lib/eval/judge";
import { METRIC_DEFINITIONS } from "@/lib/eval/report";
import type {
  EvalDocument,
  EvalModels,
  EvalQuestion,
  EvalReport,
  EvalRow,
  JudgeControl,
  KindScores,
} from "@/lib/eval/types";
import { parseCitations } from "@/lib/citations";
import {
  DEFAULT_RRF_K,
  retrieve,
  type ChunkHit,
  type Reranker,
} from "@/lib/retrieval";
import type { RetrievalMode } from "@/lib/types";

const RETRIEVERS: RetrievalMode[] = ["vector", "hybrid", "hybrid-rerank"];
const RANK_DEPTH = 20;
const ANSWER_SOURCES = 6;

export interface EvalRuntime {
  embedder: Embedder;
  reranker: Reranker;
  judge: FaithfulnessJudge;
  answerer: (question: string, chunks: ChunkHit[]) => Promise<string>;
  vectorThreshold: number;
  fullTextName: string;
  mode: EvalReport["mode"];
  note: string;
  hardware?: string;
  models?: EvalModels;
}

function indexChunks(documents: EvalDocument[], strategy: ChunkingStrategy): ChunkHit[] {
  const hits: ChunkHit[] = [];
  for (const document of documents) {
    for (const chunk of chunkWithStrategy(document.text, strategy)) {
      hits.push({
        id: `${document.name}::${chunk.index}`,
        content: chunk.content,
        heading: chunk.metadata.heading ?? null,
        document_name: document.name,
        chunk_index: chunk.index,
        similarity: null,
        text_rank: null,
      });
    }
  }
  return hits;
}

export function relevantChunkIds(chunks: ChunkHit[], quotes: string[]): Set<string> {
  const ids = new Set<string>();
  for (const chunk of chunks) {
    const haystack = `${chunk.heading ?? ""}\n${chunk.content}`;
    if (quotes.some((quote) => haystack.includes(quote))) ids.add(chunk.id);
  }
  return ids;
}

function assertQuotesSurvive(
  questions: EvalQuestion[],
  chunks: ChunkHit[],
  strategy: ChunkingStrategy
): void {
  for (const question of questions) {
    for (const quote of question.gold_quotes) {
      const found = chunks.some((chunk) =>
        `${chunk.heading ?? ""}\n${chunk.content}`.includes(quote)
      );
      if (!found) {
        throw new Error(`No ${strategy} chunk contains a gold quote for ${question.id}`);
      }
    }
  }
}

function emptyKinds(): Record<string, { n: number; recall5: number[]; mrr: number[] }> {
  return {};
}

export async function scoreJudgeControls(
  judge: FaithfulnessJudge,
  controls: JudgeControl[]
): Promise<EvalReport["judge_controls"]> {
  let correct = 0;
  let errors = 0;
  for (const control of controls) {
    try {
      const verdict = await judge.judge({
        question: control.question,
        answer: control.answer,
        sources: control.sources,
      });
      if (verdict.faithful === control.expect_faithful) correct += 1;
    } catch {
      errors += 1;
    }
  }
  const judged = controls.length - errors;
  return {
    accuracy: judged === 0 ? 0 : correct / judged,
    n: controls.length,
    errors,
  };
}

export async function runEvaluation(
  documents: EvalDocument[],
  questions: EvalQuestion[],
  controls: JudgeControl[],
  runtime: EvalRuntime,
  generatedAt = new Date().toISOString()
): Promise<EvalReport> {
  if (documents.length === 0) throw new Error("Eval corpus is empty");
  if (questions.length === 0) throw new Error("Eval question set is empty");

  const results: EvalRow[] = [];

  for (const strategy of CHUNKING_STRATEGIES) {
    const chunks = indexChunks(documents, strategy);
    assertQuotesSurvive(questions, chunks, strategy);
    const vectors = await runtime.embedder.embed(chunks.map((chunk) => chunk.content));
    const index = new MemoryIndex(chunks, vectors);

    for (const retriever of RETRIEVERS) {
      const recall1: number[] = [];
      const recall5: number[] = [];
      const mrr: number[] = [];
      const citation: number[] = [];
      const faithful: number[] = [];
      let judgeErrors = 0;
      const kinds = emptyKinds();

      for (const question of questions) {
        const hits = await retrieve(
          question.question,
          {
            mode: retriever,
            limit: RANK_DEPTH,
            candidates: RANK_DEPTH,
            threshold: runtime.vectorThreshold,
            rrfK: DEFAULT_RRF_K,
            rerankEnabled: retriever === "hybrid-rerank",
          },
          {
            embedQuery: async (text) => {
              const [vector] = await runtime.embedder.embed([text]);
              return vector;
            },
            vectorSearch: async (embedding, limit, threshold) =>
              index.vectorSearch(embedding, limit, threshold),
            textSearch: async (query, limit) => index.textSearch(query, limit),
            reranker: runtime.reranker,
          }
        );

        const relevant = relevantChunkIds(chunks, question.gold_quotes);
        const ids = hits.map((hit) => hit.id);
        const recallAt5 = recallAtK(ids, relevant, 5);
        const rank = reciprocalRank(ids, relevant);
        recall1.push(recallAtK(ids, relevant, 1));
        recall5.push(recallAt5);
        mrr.push(rank);

        const bucket = kinds[question.kind] ?? { n: 0, recall5: [], mrr: [] };
        bucket.n += 1;
        bucket.recall5.push(recallAt5);
        bucket.mrr.push(rank);
        kinds[question.kind] = bucket;

        const shown = hits.slice(0, ANSWER_SOURCES);
        const answer = await runtime.answerer(question.question, shown);
        const cited = parseCitations(answer);
        citation.push(
          citationAccuracy(
            cited,
            shown.map((hit) => hit.id),
            relevant
          )
        );

        const citedText = cited
          .map((sourceNumber) => shown[sourceNumber - 1]?.content)
          .filter((content): content is string => typeof content === "string");
        try {
          const verdict = await runtime.judge.judge({
            question: question.question,
            answer,
            sources: citedText,
          });
          faithful.push(verdict.faithful ? 1 : 0);
        } catch {
          judgeErrors += 1;
        }
      }

      const byKind: Record<string, KindScores> = {};
      for (const [kind, bucket] of Object.entries(kinds)) {
        byKind[kind] = {
          n: bucket.n,
          recall_at_5: mean(bucket.recall5),
          mrr: mean(bucket.mrr),
        };
      }

      results.push({
        chunking: strategy,
        retriever,
        chunks: chunks.length,
        n: questions.length,
        recall_at_1: mean(recall1),
        recall_at_5: mean(recall5),
        mrr: mean(mrr),
        faithfulness: faithful.length === 0 ? null : mean(faithful),
        citation_accuracy: mean(citation),
        judge_errors: judgeErrors,
        by_kind: byKind,
      });
    }
  }

  return {
    mode: runtime.mode,
    live: runtime.mode === "live",
    generated_at: generatedAt,
    date: generatedAt.slice(0, 10),
    hardware: runtime.hardware,
    models: runtime.models,
    note: runtime.note,
    embedder: runtime.embedder.name,
    full_text: runtime.fullTextName,
    reranker: runtime.reranker.name,
    judge: {
      name: runtime.judge.name,
      prompt: FAITHFULNESS_JUDGE_PROMPT,
      limits: FAITHFULNESS_JUDGE_LIMITS,
    },
    ranking_depth: RANK_DEPTH,
    answer_sources: ANSWER_SOURCES,
    rrf_k: DEFAULT_RRF_K,
    vector_threshold: runtime.vectorThreshold,
    questions: questions.length,
    definitions: METRIC_DEFINITIONS,
    judge_controls: await scoreJudgeControls(runtime.judge, controls),
    results,
  };
}
