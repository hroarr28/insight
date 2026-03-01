import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/embeddings";
import type { SearchResult } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const { query, limit = 5 } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required." },
        { status: 400 }
      );
    }

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Search for similar chunks using pgvector
    const { data, error } = await supabaseAdmin.rpc("match_documents", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.3,
      match_count: limit,
    });

    if (error) {
      console.error("Search error:", error);
      return NextResponse.json(
        { error: "Search failed." },
        { status: 500 }
      );
    }

    const results: SearchResult[] = (data || []).map(
      (row: {
        content: string;
        heading: string | null;
        document_name: string;
        chunk_index: number;
        similarity: number;
      }) => ({
        content: row.content,
        heading: row.heading,
        document_name: row.document_name,
        chunk_index: row.chunk_index,
        similarity: row.similarity,
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
