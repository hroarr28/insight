import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chunkText } from "../src/lib/chunker.ts";
import { seedPlan } from "../src/lib/seed-plan.ts";

const SAMPLE_NAME = "pocket-sundial.txt";

async function embedOpenAI(texts: string[], apiKey: string): Promise<number[][]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
  });
  if (!response.ok) throw new Error(`Embeddings request failed (${response.status})`);
  const body = (await response.json()) as { data?: { embedding: number[]; index: number }[] };
  const rows = body.data ?? [];
  rows.sort((a, b) => a.index - b.index);
  return rows.map((row) => row.embedding);
}

async function main(): Promise<void> {
  const plan = seedPlan(process.env);
  if (plan.action === "skip") {
    console.log(plan.reason);
    return;
  }
  if (plan.missing.length > 0) {
    console.error(`Missing ${plan.missing.join(", ")}.`);
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string;
  const apiKey = process.env.OPENAI_API_KEY as string;
  const supabase = createClient(url, key);
  const existing = await supabase.from("documents").select("id").eq("name", SAMPLE_NAME).limit(1);
  if (existing.error) {
    console.error("Could not read documents. Apply supabase/migrations/001_initial_schema.sql and confirm the project is running.");
    process.exit(1);
  }
  if (existing.data && existing.data.length > 0) {
    console.log(`${SAMPLE_NAME} is already stored.`);
    return;
  }
  const text = readFileSync(path.join(process.cwd(), "samples", SAMPLE_NAME), "utf8");
  const chunks = chunkText(text);
  const embeddings = await embedOpenAI(chunks.map((chunk) => chunk.content), apiKey);
  const inserted = await supabase
    .from("documents")
    .insert({ name: SAMPLE_NAME, file_type: "text/plain", chunk_count: chunks.length })
    .select()
    .single();
  if (inserted.error || !inserted.data) {
    console.error("Could not insert the sample document.");
    process.exit(1);
  }
  const saved = await supabase.from("document_chunks").insert(
    chunks.map((chunk, index) => ({
      document_id: inserted.data.id,
      content: chunk.content,
      chunk_index: chunk.index,
      heading: chunk.metadata.heading ?? null,
      embedding: JSON.stringify(embeddings[index]),
    }))
  );
  if (saved.error) {
    await supabase.from("documents").delete().eq("id", inserted.data.id);
    console.error("Could not insert sample chunks.");
    process.exit(1);
  }
  console.log(`Stored ${SAMPLE_NAME} (${chunks.length} chunks).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Seed failed");
  process.exit(1);
});
