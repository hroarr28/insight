import { NextRequest, NextResponse } from "next/server";
import { EmbeddingDimensionError } from "@/lib/providers/config";
import { resolveRetrievalMode } from "@/lib/retrieval";
import { retrieveForApp } from "@/lib/search-documents";
import { validateSearchRequest } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
    }

    const parsed = validateSearchRequest(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const { results } = await retrieveForApp(
      parsed.value.query,
      parsed.value.limit,
      parsed.value.mode ?? resolveRetrievalMode(process.env.RETRIEVAL_MODE)
    );

    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof EmbeddingDimensionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Search error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
