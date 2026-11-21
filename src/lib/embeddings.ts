import { getTextProvider } from "@/lib/providers";

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  return getTextProvider().embed(texts);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text]);
  if (!embedding) throw new Error("Embedding provider returned no vector");
  return embedding;
}
