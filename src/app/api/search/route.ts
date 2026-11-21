import { NextRequest, NextResponse } from "next/server";
import { liveConfigurationError, liveProvider, resolveAppMode } from "@/lib/app-mode";
import { safeLog } from "@/lib/config-status";
import { jsonError } from "@/lib/http";
import { normalizeQuestion, playbackFor } from "@/lib/replay";
import { currentReplay } from "@/lib/replay-data";
import {
  guardBodySize,
  guardSearchRate,
  guardStorageConfig,
  MAX_JSON_BYTES,
  validateSearchInput,
} from "@/lib/request-guards";
import { enforceDemoSpend } from "@/lib/spend-cap";
import { consumeDemoCall } from "@/lib/spend-store";
import { supabaseAdmin } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/embeddings";
import type { SearchResult } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const oversized = guardBodySize(request, MAX_JSON_BYTES);
    if (oversized) return oversized;
    const limited = guardSearchRate(request);
    if (limited) return limited;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Request body must be JSON.", 400);
    }
    const parsed = validateSearchInput(body);
    if (!parsed.ok) return jsonError(parsed.error, 400);

    if (resolveAppMode() === "demo") {
      const replay = currentReplay();
      const playback = playbackFor(replay, parsed.query);
      const wanted = normalizeQuestion(parsed.query);
      const known = replay.questions.some((item) => normalizeQuestion(item.question) === wanted);
      return NextResponse.json({
        results: playback.recorded && known ? playback.sources : [],
        demo: true,
      });
    }

    const liveError = liveConfigurationError();
    if (liveError) return jsonError(liveError, 503);
    const storage = guardStorageConfig();
    if (storage) return storage;
    if (liveProvider() === "openai") {
      const spend = await enforceDemoSpend(process.env, consumeDemoCall);
      if (!spend.ok) {
        return jsonError(spend.error ?? "Request refused.", spend.status ?? 503);
      }
    }

    const queryEmbedding = await generateEmbedding(parsed.query);
    const { data, error } = await supabaseAdmin.rpc("match_documents", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.3,
      match_count: parsed.limit,
    });
    if (error) {
      safeLog("Search", error);
      return jsonError("Search failed.", 503);
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
    safeLog("Search", error);
    return jsonError("Internal server error.", 500);
  }
}
