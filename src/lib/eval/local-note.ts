import type { ProviderConfig } from "@/lib/providers/config";

/** Differences between npm run eval:local and the Supabase SQL functions. */
export function localEvalNote(config: ProviderConfig): string {
  return (
    `Local Ollama run. Chat, reranking, and the faithfulness judge use ${config.chatModel}. ` +
    `Embeddings use ${config.embedModel} (${config.embeddingDimensions} dimensions), not text-embedding-3-small, and nothing is written to Supabase. ` +
    `The vector leg is in-process cosine top-k with no 0.3 floor. That floor in match_documents was chosen for OpenAI cosine scores and does not transfer to this model. ` +
    `The keyword leg ORs at most 40 lightly stemmed lexemes and ranks them with BM25 (k1 = 1.2, b = 0.75). ` +
    `Postgres search_documents_fts uses the english snowball stemmer, ts_rank_cd, and heading weight A against body weight B. ` +
    `Fusion is the same reciprocal rank fusion with k = 60. ` +
    `The local judge is weaker than a held-out judge: it is the same model that wrote the answer, so it shares that model's blind spots.`
  );
}
