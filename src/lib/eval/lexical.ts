import type { ChunkHit, Reranker } from "@/lib/retrieval";

const DIMENSIONS = 256;

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "being", "by", "as", "at",
  "from", "that", "this", "it", "its", "he", "she", "his", "her", "they",
  "their", "them", "we", "our", "you", "your", "not", "but", "which",
  "have", "has", "had", "do", "does", "did", "if", "so", "than", "then",
  "into", "over", "after", "before", "about", "what", "when", "where",
  "who", "whom", "why", "how", "there", "these", "those", "such", "no",
  "nor", "too", "very", "can", "will", "just", "only", "also", "would",
  "could", "should", "may", "might", "must", "shall",
]);

/** Light suffix stem. This is not the Postgres english snowball stemmer. */
export function stemToken(token: string): string {
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const tokens: string[] = [];
  for (const raw of matches) {
    if (STOPWORDS.has(raw)) continue;
    const stemmed = stemToken(raw);
    if (stemmed.length < 2 || STOPWORDS.has(stemmed)) continue;
    tokens.push(stemmed);
  }
  return tokens;
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic signed bag-of-words embedding. Scores are not cosine-calibrated to OpenAI. */
export function hashEmbed(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  for (const token of tokenize(text)) {
    const hash = fnv1a(token);
    const index = (hash >>> 1) % DIMENSIONS;
    vector[index] += hash & 1 ? 1 : -1;
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

export interface Embedder {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
}

export const hashingEmbedder: Embedder = {
  name: "hashing-bow-256",
  async embed(texts) {
    return texts.map((text) => hashEmbed(text));
  },
};

interface Bm25Document {
  id: string;
  tf: Map<string, number>;
  length: number;
}

export class Bm25Index {
  private readonly documents: Bm25Document[];
  private readonly documentFrequency = new Map<string, number>();
  private readonly averageLength: number;

  constructor(docs: { id: string; text: string }[], private readonly k1 = 1.2, private readonly b = 0.75) {
      let total = 0;
      this.documents = docs.map((doc) => {
        const tf = new Map<string, number>();
        for (const token of tokenize(doc.text)) {
          tf.set(token, (tf.get(token) ?? 0) + 1);
        }
        for (const term of tf.keys()) {
          this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
        }
        const length = [...tf.values()].reduce((sum, count) => sum + count, 0);
        total += length;
        return { id: doc.id, tf, length };
      });
    this.averageLength = this.documents.length === 0 ? 0 : total / this.documents.length;
  }

  search(query: string, limit: number): { id: string; score: number }[] {
    const terms = [...new Set(tokenize(query))];
    if (terms.length === 0 || this.documents.length === 0) return [];

    const n = this.documents.length;
    const scored = this.documents.map((doc) => {
      let score = 0;
      const normaliser =
        1 - this.b + this.b * (doc.length / (this.averageLength || 1));
      for (const term of terms) {
        const df = this.documentFrequency.get(term) ?? 0;
        const tf = doc.tf.get(term) ?? 0;
        if (df === 0 || tf === 0) continue;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += idf * ((tf * (this.k1 + 1)) / (tf + this.k1 * normaliser));
      }
      return { id: doc.id, score };
    });

    return scored
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, limit);
  }
}

/** Overlap count, not BM25. Used as the offline stand-in for the LLM reranker. */
export function createLexicalReranker(): Reranker {
  return {
    name: "lexical-overlap",
    async rerank(query, chunks, limit) {
      const queryTerms = new Set(tokenize(query));
      const ranked = chunks
        .map((chunk, index) => {
          const terms = new Set(tokenize(searchableText(chunk)));
          let overlap = 0;
          for (const term of queryTerms) {
            if (terms.has(term)) overlap += 1;
          }
          return { chunk, overlap, index };
        })
        .sort((a, b) => b.overlap - a.overlap || a.index - b.index);
      return ranked.slice(0, limit).map((entry) => entry.chunk);
    },
  };
}

export function searchableText(chunk: Pick<ChunkHit, "heading" | "content">): string {
  return chunk.heading ? `${chunk.heading}\n\n${chunk.content}` : chunk.content;
}
