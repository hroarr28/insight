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

export interface SearchResult {
  content: string;
  heading: string | null;
  document_name: string;
  chunk_index: number;
  similarity: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SearchResult[];
}
