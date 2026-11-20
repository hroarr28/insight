import { NextRequest } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { buildSystemPrompt } from "@/lib/grounding";
import { resolveRetrievalMode } from "@/lib/retrieval";
import { retrieveForApp } from "@/lib/search-documents";
import { validateQuestion } from "@/lib/validation";

export const maxDuration = 30;

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Request body must be JSON.", 400);
    }

    const parsed = validateQuestion(body);
    if (!parsed.ok) return jsonError(parsed.error, parsed.status);

    const { question, history } = parsed.value;
    const { results, context } = await retrieveForApp(
      question,
      6,
      resolveRetrievalMode(process.env.RETRIEVAL_MODE)
    );

    const messages = [
      ...history,
      { role: "user" as const, content: question },
    ];

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: buildSystemPrompt(context),
      messages,
    });

    const sourcesHeader = Buffer.from(JSON.stringify(results)).toString("base64");
    const response = result.toTextStreamResponse();
    response.headers.set("X-Sources", sourcesHeader);
    return response;
  } catch (error) {
    console.error("Ask error:", error instanceof Error ? error.message : "unknown error");
    return jsonError("Internal server error.", 500);
  }
}
