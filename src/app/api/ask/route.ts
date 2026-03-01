import { NextRequest } from "next/server";
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { supabaseAdmin } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/embeddings";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const { question, history = [] } = await request.json();

    if (!question || typeof question !== "string") {
      return new Response(
        JSON.stringify({ error: "Question is required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate embedding for the question
    const queryEmbedding = await generateEmbedding(question);

    // Retrieve relevant chunks
    const { data: chunks, error } = await supabaseAdmin.rpc(
      "match_documents",
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: 0.3,
        match_count: 6,
      }
    );

    if (error) {
      console.error("RAG search error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to search documents." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const context =
      chunks && chunks.length > 0
        ? chunks
            .map(
              (c: { content: string; document_name: string; chunk_index: number }, i: number) =>
                `[Source ${i + 1}: ${c.document_name}, chunk ${c.chunk_index}]\n${c.content}`
            )
            .join("\n\n---\n\n")
        : "No relevant documents found.";

    const sources =
      chunks?.map(
        (c: {
          content: string;
          heading: string | null;
          document_name: string;
          chunk_index: number;
          similarity: number;
        }) => ({
          content: c.content,
          heading: c.heading,
          document_name: c.document_name,
          chunk_index: c.chunk_index,
          similarity: c.similarity,
        })
      ) || [];

    const systemPrompt = `You are Insight, an AI assistant that answers questions based on uploaded documents.

RULES:
- Answer ONLY using the provided context. Do not use external knowledge.
- If the context doesn't contain enough information, say so clearly.
- Reference your sources using [Source N] notation.
- Be concise and direct.
- Use markdown formatting for clarity.
- If the question is about something not in the documents, explain that you can only answer based on uploaded content.

CONTEXT FROM DOCUMENTS:
${context}`;

    const messages = [
      ...history.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: question },
    ];

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      messages,
    });

    // Add sources as a custom header (base64 encoded JSON)
    const sourcesHeader = Buffer.from(JSON.stringify(sources)).toString(
      "base64"
    );

    const response = result.toTextStreamResponse();
    response.headers.set("X-Sources", sourcesHeader);

    return response;
  } catch (error) {
    console.error("Ask error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
