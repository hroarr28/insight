# Insight

Upload a PDF, text file, or Markdown file. Ask a question. The answer is streamed from the passages that were retrieved, with `[Source N]` citations.

The retrieval path is hybrid. A pgvector cosine search and a Postgres full-text search each return a candidate list, and reciprocal rank fusion merges them. An optional reranker sits behind that merge. It is off unless you turn it on, and a failure leaves the fused order in place.

## Architecture

```mermaid
flowchart TD
  upload[Upload PDF, TXT, or MD] --> validate[Validate type and size]
  validate --> extract[Extract text]
  extract --> chunk[Chunk]
  chunk --> embed[Embed text-embedding-3-small]
  embed --> db[(document_chunks: vector 1536 and tsvector)]

  question[Question] --> qval[Validate length and history]
  qval --> qembed[Embed the question]
  qembed --> vec[match_documents]
  qval --> fts[search_documents_fts]
  vec --> rrf[Reciprocal rank fusion, k = 60]
  fts --> rrf
  rrf --> gate{Rerank enabled?}
  gate -->|no, or the call fails| top[Top passages]
  gate -->|yes| rerank[gpt-4o-mini reranker]
  rerank --> top
  top --> answer[gpt-4o-mini, grounded, Source N citations]
```

Full-text search runs while the question is being embedded, so the extra round trip overlaps that call. Fusion itself is in process.

## Design

**Vector leg.** Unchanged. `match_documents` in `supabase/migrations/001_initial_schema.sql` ranks by cosine similarity and drops anything at or below 0.3. The ask route still shows six passages to the model.

**Full-text leg.** `supabase/migrations/002_hybrid_full_text.sql` adds a generated `tsvector` on `document_chunks`. Headings are weight A and the body is weight B, so the column cannot drift from the row. `search_documents_fts` ORs the english lexemes of the question. An AND query (`plainto_tsquery` or `websearch_to_tsquery`) returns nothing for a normal question, because no single chunk contains every word, and hybrid search would quietly become vector-only. Stopwords are removed by `to_tsvector`. If the function is missing or errors, the request keeps the vector list and logs the error message only.

**Fusion.** Reciprocal rank fusion, k = 60, lives in `src/lib/rrf.ts`. It does not need the two rankers to share a score scale. The same function runs in the app and in the eval. Ties break by id.

**Rerank.** `src/lib/rerank.ts` defines the interface. The default is a no-op. Set `RERANK_ENABLED=true` with `OPENAI_API_KEY` present, or send `mode: "hybrid-rerank"` to `/api/search`, to score the fused candidates with gpt-4o-mini at temperature 0. A missing key, a bad JSON payload, or a thrown error returns the fused order. `RETRIEVAL_MODE=vector` never reranks. The percent shown on a source card is cosine similarity when the passage came from the vector list. A keyword-only hit is labelled `keyword` rather than given a fake similarity.

**Inputs.** Questions and search queries are trimmed and capped at 2000 characters. History is at most 10 messages. Uploads must be `.pdf`, `.txt`, `.md`, or `.markdown`, at most 10MB, and the mime type must be empty, `application/octet-stream`, or one of the allowed types. Document ids must be uuids. Failures return 400 with a fixed message. Logs do not include the key or the document text.

**Chunking.** `chunkText` is the production chunker and is unchanged. Its size argument is a character budget and its overlap argument is a word count. On a 500-character chunk, a 50-word overlap is a large fraction of the chunk. That is the baseline the eval measures, not a silent "fix". Three strategies are compared:

| Strategy | What it does |
| --- | --- |
| `paragraph-500-50` | Production chunker. 500-character budget, 50-word overlap, paragraph boundaries. |
| `paragraph-1000-100` | Same algorithm, 1000-character budget, 100-word overlap. |
| `heading-aware` | Splits on markdown headings first, then runs the 500/50 chunker inside each section. The heading is stored on every chunk from that section and written once at the start of the section text. |

A paragraph longer than the budget stays in one chunk. The baseline does not split inside a paragraph, and the eval uses the same rule so the comparison is about window size and section boundaries.

## Evaluation

The question set has 42 questions over five public-domain excerpts in `eval/corpus`. Provenance and the editorial changes (line joining, markdown headings on titles the source already had) are in `eval/corpus/SOURCES.md`. A chunk is relevant when its heading or text contains a gold quote. Quotes are unique in the corpus, so a second hit means the overlap copied the quote into a neighbouring chunk.

| Metric | Definition |
| --- | --- |
| Recall@k | Macro-average of relevant chunks in the top k, divided by the number of relevant chunks. |
| MRR | Macro-average of 1/rank of the first relevant chunk in a ranking of depth 20. Missing is 0. |
| Citation accuracy | Of the unique `[Source N]` markers, the fraction that point at a relevant passage among the six the answerer saw. No citations score 0. |
| Faithfulness | Binary verdict that every claim is entailed by the cited passages. Judge failures are left out of the average. |

The grid is the three chunkers crossed with vector, hybrid, and hybrid+rerank.

The judge prompt and its limits live in `src/lib/eval/judge.ts` (`FAITHFULNESS_JUDGE_PROMPT`, `FAITHFULNESS_JUDGE_LIMITS`). In short: the live judge is gpt-4o-mini, so it shares a family with the answer model; the verdict is binary; it sees only cited passages and does not check that the source number is the right one; it moves if the prompt changes. The offline judge is a different thing. A sentence passes when any contiguous 6-word span appears in the cited text, so a true clause glued to a false one can pass. That miss is the `control-glued-clause` item in `eval/judge-controls.json`. The offline judge also only recognises two abstention sentences.

`npm run eval` does not call OpenAI or Supabase. Embeddings are a hashing bag of words, full text is in-memory BM25 with a light stemmer, the reranker counts token overlap, and answers are a sentence copied from the top passage. The production full-text function is still `search_documents_fts`. The harness uses the same fusion, citation parser, and metric functions as the app, with those legs swapped in.

`npm run eval` and `npm run eval:live` write `eval/results/latest.json` and `eval/results/latest.md`. Read the `mode` field before treating any number as a property of the deployed stack. `npm run eval:live` needs `OPENAI_API_KEY`, keeps the 0.3 cosine floor, and uses gpt-4o-mini. It does not write to Supabase.

Chat, embeddings, reranking, and the faithfulness judge go through one provider. `LLM_PROVIDER` defaults to `openai`, which is the deployed path: `gpt-4o-mini`, `text-embedding-3-small`, and the `vector(1536)` column. `LLM_PROVIDER=ollama` sends chat and rerank to a local daemon. Upload and search refuse that provider when the embedding width is not 1536, so a 768-dimension local model cannot be written into the existing column.

## Local eval on a Mac

`npm run eval:local` needs Ollama and nothing else. No OpenAI key and no Supabase. It embeds with [embeddinggemma](https://ollama.com/library/embeddinggemma) (300M parameters, 768 dimensions), then asks, reranks, and judges with `gemma4:31b`. Vectors are cached under `eval/cache/` (gitignored), so a rerun only embeds text it has not seen.

The retrieval is in-process and uses the same reciprocal rank fusion as the app. It is not the SQL functions. Differences, also written into the results file:

- Cosine top-k has no 0.3 floor. That floor in `match_documents` was chosen for OpenAI scores.
- The keyword leg ORs at most 40 lexemes and ranks them with BM25. Postgres uses the english snowball stemmer, `ts_rank_cd`, and heading weight A against body weight B. The local stemmer only strips a few suffixes.
- The judge is the same model that wrote the answer, so it is weaker than a held-out judge.

```bash
ollama pull embeddinggemma
npm install
npm run eval:local
```

`gemma4:31b` is the chat model and is already expected to be present. If either model is missing, the script prints the `ollama pull` command and exits. Overrides:

```bash
# OLLAMA_BASE_URL=http://127.0.0.1:11434
# OLLAMA_CHAT_MODEL=gemma4:31b
# OLLAMA_EMBED_MODEL=embeddinggemma
# OLLAMA_EMBED_DIMENSIONS=768
```

The command writes `eval/results/local.json` and `eval/results/local.md`, labelled with the model tags, the machine description, the date, and recall@1, recall@5, MRR, citation accuracy, and faithfulness for all three chunkers and all three retrievers.

## Eval results

### Local Ollama run

Pending a local run by the owner. This table is not a measurement.

| Chunking | Retriever | Recall@1 | Recall@5 | MRR | Faithfulness | Citation accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| paragraph-500-50 | vector | pending local run | pending local run | pending local run | pending local run | pending local run |
| paragraph-500-50 | hybrid | pending local run | pending local run | pending local run | pending local run | pending local run |
| paragraph-500-50 | hybrid-rerank | pending local run | pending local run | pending local run | pending local run | pending local run |
| paragraph-1000-100 | vector | pending local run | pending local run | pending local run | pending local run | pending local run |
| paragraph-1000-100 | hybrid | pending local run | pending local run | pending local run | pending local run | pending local run |
| paragraph-1000-100 | hybrid-rerank | pending local run | pending local run | pending local run | pending local run | pending local run |
| heading-aware | vector | pending local run | pending local run | pending local run | pending local run | pending local run |
| heading-aware | hybrid | pending local run | pending local run | pending local run | pending local run | pending local run |
| heading-aware | hybrid-rerank | pending local run | pending local run | pending local run | pending local run | pending local run |

Replace those cells with the table from `eval/results/local.md` after `npm run eval:local`.

An offline fixture run (`npm run eval`, `"mode": "offline-fixture"`) only checks that the harness writes a file. It is not this table.

### OpenAI

A paid OpenAI run is optional. `npm run eval:live` needs `OPENAI_API_KEY` and does not use Supabase. No OpenAI figures are recorded here.

## Tests and CI

Vitest covers chunking, reciprocal rank fusion, citation parsing, request validation, rerank parsing and failure, fusion fallback, the metric definitions, provider selection, a fake Ollama client, and the embedding cache. The dataset test checks that every gold quote occurs once. Nothing in the suite opens a network connection or a Supabase client. CI does not run `npm run eval:local`.

GitHub Actions (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, the offline eval, and the production build on pull requests. It does not use secrets.

```bash
npm run lint
npm run typecheck
npm test
npm run eval
npm run build
```

## Setup

1. Create a Supabase project. Run `supabase/migrations/001_initial_schema.sql`, then `supabase/migrations/002_hybrid_full_text.sql`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL, the anon key, the service role key, and `OPENAI_API_KEY`.
3. `npm install && npm run dev`.

`RERANK_ENABLED` is unset by default. Set it to `true` only when you want the extra model call. `RETRIEVAL_MODE` can be `vector`, `hybrid` (the default), or `hybrid-rerank`.

The vector index from the first migration is IVFFlat with `lists = 100`. That setting is a poor fit until the table is large. It is unchanged here because the original migration is left as applied history.
