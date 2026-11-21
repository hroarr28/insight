import { describe, expect, it } from "vitest";
import { extractiveAnswer } from "@/lib/eval/answer";
import { heuristicJudge } from "@/lib/eval/judge";
import { createLexicalReranker, hashingEmbedder } from "@/lib/eval/lexical";
import { renderMarkdown } from "@/lib/eval/report";
import { runEvaluation } from "@/lib/eval/run";
import type { EvalDocument, EvalQuestion } from "@/lib/eval/types";

const documents: EvalDocument[] = [
  {
    name: "gold.txt",
    text: "The xylophone quantum flibbertigibbet answers the riddle of zircon in one clear sentence.\n\nA second paragraph talks about ordinary weather.",
  },
  {
    name: "other.txt",
    text: "Ordinary bread and weather fill this unrelated page without those rare tokens.",
  },
];

const questions: EvalQuestion[] = [
  {
    id: "q1",
    document: "gold.txt",
    kind: "lexical",
    question: "What does the xylophone quantum flibbertigibbet answer?",
    gold_quotes: ["xylophone quantum flibbertigibbet answers the riddle of zircon"],
  },
];

describe("runEvaluation", () => {
  it("scores a fixture corpus without leaving the process", async () => {
    const report = await runEvaluation(
      documents,
      questions,
      [
        {
          id: "abstain",
          expect_faithful: true,
          question: "Missing?",
          answer: "I can only answer from the uploaded documents, and I could not find a relevant passage.",
          sources: [],
        },
      ],
      {
        embedder: hashingEmbedder,
        reranker: createLexicalReranker(),
        judge: heuristicJudge,
        answerer: async (question, chunks) => extractiveAnswer(question, chunks),
        vectorThreshold: 0,
        fullTextName: "in-memory-bm25",
        mode: "offline-fixture",
        note: "fixture",
      },
      "2026-11-20T00:00:00.000Z"
    );

    expect(report.live).toBe(false);
    expect(report.results).toHaveLength(9);
    for (const row of report.results) {
      expect(row.n).toBe(1);
      expect(row.recall_at_5).toBe(1);
      expect(row.mrr).toBe(1);
      expect(row.citation_accuracy).toBe(1);
      expect(row.faithfulness).toBe(1);
      expect(row.judge_errors).toBe(0);
    }
    expect(report.judge_controls.accuracy).toBe(1);

    const markdown = renderMarkdown(report);
    expect(markdown).toContain("offline-fixture");
    expect(markdown).toContain("paragraph-500-50");
    expect(markdown).toContain("hybrid-rerank");
    expect(markdown).toContain("2026-11-20T00:00:00.000Z");
  });

  it("refuses a gold quote that no chunk contains", async () => {
    await expect(
      runEvaluation(
        documents,
        [{ ...questions[0], gold_quotes: ["this quotation is not in the fixture"] }],
        [],
        {
          embedder: hashingEmbedder,
          reranker: createLexicalReranker(),
          judge: heuristicJudge,
          answerer: async () => "unused",
          vectorThreshold: 0,
          fullTextName: "in-memory-bm25",
          mode: "offline-fixture",
          note: "fixture",
        }
      )
    ).rejects.toThrow(/gold quote/);
  });
});
