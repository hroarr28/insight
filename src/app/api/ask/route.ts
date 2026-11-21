import { NextRequest } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { liveProvider, resolveAppMode } from "@/lib/app-mode";
import { safeLog } from "@/lib/config-status";
import { buildSystemPrompt, formatContext } from "@/lib/grounding";
import { jsonError } from "@/lib/http";
import { ollamaChat, ollamaSettings } from "@/lib/ollama-client";
import { playbackFor } from "@/lib/replay";
import { currentReplay, demoBanner } from "@/lib/replay-data";
import {
  guardAskRate,
  guardBodySize,
  guardModelConfig,
  guardStorageConfig,
  MAX_JSON_BYTES,
  validateQuestionInput,
} from "@/lib/request-guards";
import { enforceDemoSpend } from "@/lib/spend-cap";
import { consumeDemoCall } from "@/lib/spend-store";
import { supabaseAdmin } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/embeddings";
import { textStream } from "@/lib/text-stream";

export const maxDuration = 30;

function replayResponse(question: string): Response {
  const replay = currentReplay();
  const playback = playbackFor(replay, question);
  const headers = new Headers({
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-demo-mode": "replay",
    "x-demo-recorded": playback.recorded ? "true" : "false",
    "x-demo-label": demoBanner(replay),
  });
  if (playback.sources.length > 0) {
    headers.set("x-sources", Buffer.from(JSON.stringify(playback.sources)).toString("base64"));
  }
  return new Response(textStream(playback.text), { status: 200, headers });
}

export async function POST(request: NextRequest) {
  try {
    const oversized = guardBodySize(request, MAX_JSON_BYTES);
    if (oversized) return oversized;
    const limited = guardAskRate(request);
    if (limited) return limited;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Request body must be JSON.", 400);
    }
    const parsed = validateQuestionInput(body);
    if (!parsed.ok) return jsonError(parsed.error, 400);

    if (resolveAppMode() === "demo") return replayResponse(parsed.question);

    const model = guardModelConfig();
    if (liveProvider() === "openai" && model) return model;
    const storage = guardStorageConfig();
    if (storage) return storage;

    if (liveProvider() === "openai") {
      const spend = await enforceDemoSpend(process.env, consumeDemoCall);
      if (!spend.ok) {
        return jsonError(spend.error ?? "Request refused.", spend.status ?? 503, {
          ...(spend.retryAfterSeconds ? { "retry-after": String(spend.retryAfterSeconds) } : {}),
        });
      }
    }

    const queryEmbedding = await generateEmbedding(parsed.question);
    const { data: chunks, error } = await supabaseAdmin.rpc("match_documents", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.3,
      match_count: 6,
    });
    if (error) {
      safeLog("Ask search", error);
      return jsonError("Failed to search documents.", 503);
    }

    const rows = (chunks ?? []) as {
      content: string;
      heading: string | null;
      document_name: string;
      chunk_index: number;
      similarity: number;
    }[];
    const context = formatContext(rows);
    const sources = rows.map((row) => ({
      content: row.content,
      heading: row.heading,
      document_name: row.document_name,
      chunk_index: row.chunk_index,
      similarity: row.similarity,
    }));
    const sourcesHeader = Buffer.from(JSON.stringify(sources)).toString("base64");

    if (liveProvider() === "ollama") {
      const settings = ollamaSettings();
      const text = await ollamaChat(settings, {
        system: buildSystemPrompt(context),
        prompt: parsed.question,
      });
      return new Response(textStream(text), {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "x-sources": sourcesHeader,
        },
      });
    }

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: buildSystemPrompt(context),
      messages: [...parsed.history, { role: "user" as const, content: parsed.question }],
    });
    const response = result.toTextStreamResponse();
    response.headers.set("x-sources", sourcesHeader);
    return response;
  } catch (error) {
    safeLog("Ask", error);
    return jsonError("Internal server error.", 500);
  }
}
