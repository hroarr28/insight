# Retrieval eval

> Mode: `offline-fixture`. Offline fixture run. Embeddings are a 256-dimensional hashing bag of words, not OpenAI text-embedding-3-small. Full-text ranking is in-memory BM25 with a light stemmer, not Postgres ts_rank_cd. The reranker counts token overlap; it is not gpt-4o-mini. The faithfulness judge is a 6-word overlap heuristic. Vector candidates use no cosine floor because hashing scores are not on the production 0.3 scale. This file proves the harness runs. It is not a measurement of the deployed stack.

| Chunking | Retriever | Recall@1 | Recall@5 | MRR | Faithfulness | Citation accuracy |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| paragraph-500-50 | vector | 0.210 | 0.379 | 0.407 | 1.000 | 0.310 |
| paragraph-500-50 | hybrid | 0.355 | 0.614 | 0.604 | 1.000 | 0.500 |
| paragraph-500-50 | hybrid-rerank | 0.474 | 0.713 | 0.718 | 1.000 | 0.643 |
| paragraph-1000-100 | vector | 0.194 | 0.451 | 0.450 | 1.000 | 0.333 |
| paragraph-1000-100 | hybrid | 0.312 | 0.624 | 0.627 | 1.000 | 0.524 |
| paragraph-1000-100 | hybrid-rerank | 0.467 | 0.683 | 0.749 | 1.000 | 0.690 |
| heading-aware | vector | 0.187 | 0.403 | 0.370 | 0.905 | 0.262 |
| heading-aware | hybrid | 0.284 | 0.597 | 0.533 | 0.905 | 0.405 |
| heading-aware | hybrid-rerank | 0.450 | 0.708 | 0.682 | 0.976 | 0.619 |

Judge `heuristic-6gram` control accuracy: 0.833 on 6 labelled controls (0 judge errors).
Embedder `hashing-bow-256`. Full text `in-memory-bm25`. Reranker `lexical-overlap`. Vector floor 0. RRF k 60.
Generated at 2026-11-20T20:27:14.802Z.
