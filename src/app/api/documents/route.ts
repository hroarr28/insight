import { NextResponse } from "next/server";
import { demoMutationMessage, resolveAppMode } from "@/lib/app-mode";
import { safeLog, STORAGE_UNAVAILABLE } from "@/lib/config-status";
import { jsonError } from "@/lib/http";
import { demoCatalog } from "@/lib/replay-data";
import { guardAdmin, guardStorageConfig, validateDocumentId } from "@/lib/request-guards";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    if (resolveAppMode() === "demo") {
      return NextResponse.json(demoCatalog());
    }
    const missing = guardStorageConfig();
    if (missing) return missing;

    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("id, name, file_type, chunk_count, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      safeLog("Documents fetch", error);
      return jsonError(STORAGE_UNAVAILABLE, 503);
    }

    return NextResponse.json({ documents: data || [], demo: false });
  } catch (error) {
    safeLog("Documents", error);
    return jsonError("Document storage is unavailable.", 503);
  }
}

export async function DELETE(request: Request) {
  try {
    if (resolveAppMode() === "demo") {
      return jsonError(demoMutationMessage("delete"), 403);
    }
    const denied = guardAdmin(request);
    if (denied) return denied;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Request body must be JSON.", 400);
    }
    const id = validateDocumentId(
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as { id?: unknown }).id
        : undefined
    );
    if (!id) return jsonError("A valid document id is required.", 400);

    const { error: chunkError } = await supabaseAdmin
      .from("document_chunks")
      .delete()
      .eq("document_id", id);
    if (chunkError) {
      safeLog("Delete chunks", chunkError);
      return jsonError("Failed to delete document.", 500);
    }

    const { error } = await supabaseAdmin.from("documents").delete().eq("id", id);
    if (error) {
      safeLog("Delete document", error);
      return jsonError("Failed to delete document.", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    safeLog("Delete", error);
    return jsonError("Failed to delete document.", 500);
  }
}
