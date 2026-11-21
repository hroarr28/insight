import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { validateDocumentId } from "@/lib/validation";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("id, name, file_type, chunk_count, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Documents fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch documents." },
        { status: 500 }
      );
    }

    return NextResponse.json({ documents: data || [] });
  } catch (error) {
    console.error("Documents error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
    }

    const parsed = validateDocumentId(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const id = parsed.value;

    // Delete chunks first (FK), then document
    await supabaseAdmin
      .from("document_chunks")
      .delete()
      .eq("document_id", id);

    const { error } = await supabaseAdmin
      .from("documents")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete error:", error);
      return NextResponse.json(
        { error: "Failed to delete document." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
