import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { chunkText, extractTextFromPDF } from "@/lib/chunker";
import { generateEmbeddings } from "@/lib/embeddings";
import { assertDatabaseEmbeddingDimensions, EmbeddingDimensionError } from "@/lib/providers/config";
import { validateUploadFile } from "@/lib/validation";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const uploaded = formData.get("file");
    if (!(uploaded instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const parsed = validateUploadFile({
      name: uploaded.name,
      type: uploaded.type,
      size: uploaded.size,
    });
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    const file = uploaded;

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

    assertDatabaseEmbeddingDimensions();

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
    if (error instanceof EmbeddingDimensionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Upload error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
