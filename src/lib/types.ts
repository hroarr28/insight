export interface Document {
  id: string;
  name: string;
  file_type: string;
  chunk_count: number;
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  heading: string | null;
  embedding: number[];
}

export type RetrievalMode = "vector" | "hybrid" | "hybrid-rerank";

export interface SearchResult {
  content: string;
  heading: string | null;
  document_name: string;
  chunk_index: number;
  /** Cosine similarity when the chunk came from the vector list. Null for a keyword-only hit. */
  similarity: number | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SearchResult[];
}
