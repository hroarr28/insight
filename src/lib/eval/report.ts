import type { EvalReport } from "@/lib/eval/types";

export const METRIC_DEFINITIONS = {
  recall_at_k:
    "Macro-average of |relevant chunks in the top k| / |relevant chunks|. A chunk is relevant when its heading or content contains any gold quote. Overlap can put one quote in two chunks; both count.",
  mrr:
    "Macro-average of 1/rank of the first relevant chunk. The rank is missing, and the score is 0, when no relevant chunk appears in the ranking (depth 20).",
  citation_accuracy:
    "Macro-average of (cited chunks that are relevant) / (unique [Source N] markers). A marker that does not point at a shown passage counts as wrong. An answer with no citations scores 0. Source numbers refer to the six passages the answerer saw.",
  faithfulness:
    "Macro-average of a binary verdict that every claim is entailed by the cited passages. Questions whose judge call failed are left out of the average. The judge name, prompt, and limits are on this report.",
} as const;

function formatMetric(value: number | null): string {
  if (value === null) return "n/a";
  return value.toFixed(3);
}

export function renderMarkdown(report: EvalReport): string {
  const lines = [
    "# Retrieval eval",
    "",
    `> Mode: \`${report.mode}\`. ${report.note}`,
    "",
  ];

  if (report.hardware) lines.push(`Hardware: ${report.hardware}`, "");
  if (report.models) {
    lines.push(
      `Models: chat \`${report.models.chat}\`, embeddings \`${report.models.embed}\` (${report.models.embedding_dimensions} dimensions), reranker \`${report.models.reranker}\`, judge \`${report.models.judge}\`.`,
      `Date: ${report.date}.`,
      ""
    );
  }

  lines.push(
    `| Chunking | Retriever | Recall@1 | Recall@5 | MRR | Faithfulness | Citation accuracy |`,
    `| --- | --- | ---: | ---: | ---: | ---: | ---: |`
  );

  for (const row of report.results) {
    lines.push(
      `| ${row.chunking} | ${row.retriever} | ${formatMetric(row.recall_at_1)} | ${formatMetric(row.recall_at_5)} | ${formatMetric(row.mrr)} | ${formatMetric(row.faithfulness)} | ${formatMetric(row.citation_accuracy)} |`
    );
  }

  lines.push(
    "",
    `Judge \`${report.judge.name}\` control accuracy: ${formatMetric(report.judge_controls.accuracy)} on ${report.judge_controls.n} labelled controls (${report.judge_controls.errors} judge errors).`,
    `Embedder \`${report.embedder}\`. Full text \`${report.full_text}\`. Reranker \`${report.reranker}\`. Vector floor ${report.vector_threshold}. RRF k ${report.rrf_k}.`,
    `Generated at ${report.generated_at}.`,
    ""
  );

  return lines.join("\n");
}
