import { NextRequest, NextResponse } from "next/server";
import { demoMutationMessage, liveConfigurationError, liveProvider, resolveAppMode } from "@/lib/app-mode";
import { safeLog } from "@/lib/config-status";
import { jsonError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { chunkText, extractTextFromPDF } from "@/lib/chunker";
import { generateEmbeddings } from "@/lib/embeddings";
import {
  guardBodySize,
  guardStorageConfig,
  guardUploadRate,
  MAX_UPLOAD_BYTES,
} from "@/lib/request-guards";
import { enforceDemoSpend } from "@/lib/spend-cap";
import { consumeDemoCall } from "@/lib/spend-store";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    if (resolveAppMode() === "demo") {
      return jsonError(demoMutationMessage("upload"), 403);
    }
    const oversized = guardBodySize(request, MAX_UPLOAD_BYTES + 1024 * 1024);
    if (oversized) return oversized;
    const limited = guardUploadRate(request);
    if (limited) return limited;
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allowedTypes = [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/x-markdown",
    ];
    if (
      !allowedTypes.includes(file.type) &&
      !file.name.endsWith(".md") &&
      !file.name.endsWith(".txt")
    ) {
      return NextResponse.json(
        { error: "Unsupported file type. Upload PDF, TXT, or MD files." },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum 10MB." },
        { status: 400 }
      );
    }

    // Extract text
    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;

    if (file.type === "application/pdf") {
      text = await extractTextFromPDF(buffer);
    } else {
      text = buffer.toString("utf-8");
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from file." },
        { status: 400 }
      );
    }

    // Chunk the text
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No content found in file." },
        { status: 400 }
      );
    }

    // Generate embeddings for all chunks
    const embeddings = await generateEmbeddings(
      chunks.map((c) => c.content)
    );

    // Insert document record
    const { data: doc, error: docError } = await supabaseAdmin
      .from("documents")
      .insert({
        name: file.name,
        file_type: file.type || "text/plain",
        chunk_count: chunks.length,
      })
      .select()
      .single();

    if (docError || !doc) {
      console.error("Document insert error:", docError);
      return NextResponse.json(
        { error: "Failed to save document." },
        { status: 500 }
      );
    }

    // Insert chunks with embeddings
    const chunkRows = chunks.map((chunk, i) => ({
      document_id: doc.id,
      content: chunk.content,
      chunk_index: chunk.index,
      heading: chunk.metadata.heading || null,
      embedding: JSON.stringify(embeddings[i]),
    }));

    // Insert in batches of 20
    for (let i = 0; i < chunkRows.length; i += 20) {
      const batch = chunkRows.slice(i, i + 20);
      const { error: chunkError } = await supabaseAdmin
        .from("document_chunks")
        .insert(batch);

      if (chunkError) {
        console.error("Chunk insert error:", chunkError);
        // Clean up the document if chunks fail
        await supabaseAdmin.from("documents").delete().eq("id", doc.id);
        return NextResponse.json(
          { error: "Failed to process document chunks." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      id: doc.id,
      name: doc.name,
      chunks: chunks.length,
    });
  } catch (error) {
    safeLog("Upload", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
