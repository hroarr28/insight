import { describe, expect, it } from "vitest";
import { describeHardware } from "@/lib/eval/hardware";
import { localEvalNote } from "@/lib/eval/local-note";
import { renderMarkdown } from "@/lib/eval/report";
import { resolveProviderConfig } from "@/lib/providers/config";
import type { EvalReport } from "@/lib/eval/types";

describe("local eval labelling", () => {
  it("states how the in-process ranker differs from Postgres and that the judge is the same model", () => {
    const note = localEvalNote(resolveProviderConfig({ LLM_PROVIDER: "ollama" }));
    expect(note).toContain("embeddinggemma");
    expect(note).toContain("gemma4:31b");
    expect(note).toContain("nothing is written to Supabase");
    expect(note).toContain("no 0.3 floor");
    expect(note).toContain("snowball");
    expect(note).toContain("ts_rank_cd");
    expect(note).toContain("reciprocal rank fusion");
    expect(note).toContain("same model that wrote the answer");
  });

  it("prints hardware, model tags, and the date above the metric table", () => {
    const report = {
      mode: "local-ollama",
      live: false,
      generated_at: "2026-11-20T12:00:00.000Z",
      date: "2026-11-20",
      hardware: "Apple M4 Pro, 64 GB RAM, darwin/arm64",
      models: {
        chat: "gemma4:31b",
        embed: "embeddinggemma",
        embedding_dimensions: 768,
        reranker: "gemma4:31b",
        judge: "gemma4:31b",
      },
      note: "local note",
      embedder: "ollama:embeddinggemma",
      full_text: "in-memory-bm25-or-lexemes",
      reranker: "ollama:gemma4:31b",
      judge: { name: "ollama:gemma4:31b", prompt: "prompt", limits: [] },
      ranking_depth: 20,
      answer_sources: 6,
      rrf_k: 60,
      vector_threshold: 0,
      questions: 1,
      definitions: {
        recall_at_k: "r",
        mrr: "m",
        citation_accuracy: "c",
        faithfulness: "f",
      },
      judge_controls: { accuracy: 1, n: 1, errors: 0 },
      results: [],
    } satisfies EvalReport;

    const markdown = renderMarkdown(report);
    expect(markdown).toContain("Apple M4 Pro, 64 GB RAM");
    expect(markdown).toContain("gemma4:31b");
    expect(markdown).toContain("embeddinggemma");
    expect(markdown).toContain("768");
    expect(markdown).toContain("Date: 2026-11-20.");
    expect(markdown).toContain("Recall@1");
  });

  it("describes this machine without calling a model", () => {
    expect(describeHardware()).toMatch(/GB RAM/);
  });
});