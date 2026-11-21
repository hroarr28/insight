import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Embedder } from "@/lib/eval/lexical";

interface CacheFile {
  version: 1;
  model: string;
  dimensions: number;
  entries: Record<string, number[]>;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function emptyCache(model: string, dimensions: number): CacheFile {
  return { version: 1, model, dimensions, entries: {} };
}

function readCache(filePath: string, model: string, dimensions: number): CacheFile {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Partial<CacheFile>;
    if (parsed.version !== 1 || parsed.model !== model || parsed.dimensions !== dimensions) {
      return emptyCache(model, dimensions);
    }
    if (!parsed.entries || typeof parsed.entries !== "object") return emptyCache(model, dimensions);
    return {
      version: 1,
      model,
      dimensions,
      entries: parsed.entries,
    };
  } catch {
    return emptyCache(model, dimensions);
  }
}

function writeCache(filePath: string, cache: CacheFile): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  writeFileSync(temporary, JSON.stringify(cache));
  renameSync(temporary, filePath);
}

/**
 * Reuses vectors already stored for this model. Only uncached texts are embedded,
 * and the file is rewritten after each batch so a rerun can resume.
 */
export function createCachedEmbedder(
  inner: Embedder,
  filePath: string,
  dimensions: number,
  options?: { batchSize?: number; onProgress?: (done: number, total: number) => void }
): Embedder {
  const batchSize = options?.batchSize ?? 16;
  return {
    name: inner.name,
    async embed(texts) {
      const cache = readCache(filePath, inner.name, dimensions);
      const missing: string[] = [];
      for (const text of texts) {
        const key = hashText(text);
        const stored = cache.entries[key];
        if (!stored || stored.length !== dimensions) missing.push(text);
      }
      const uniqueMissing = [...new Set(missing)];
      for (let index = 0; index < uniqueMissing.length; index += batchSize) {
        const batch = uniqueMissing.slice(index, index + batchSize);
        const vectors = await inner.embed(batch);
        batch.forEach((text, offset) => {
          cache.entries[hashText(text)] = vectors[offset];
        });
        writeCache(filePath, cache);
        options?.onProgress?.(Math.min(index + batch.length, uniqueMissing.length), uniqueMissing.length);
      }
      return texts.map((text) => {
        const vector = cache.entries[hashText(text)];
        if (!vector) throw new Error("Embedding cache missed a text it had just stored");
        return vector;
      });
    },
  };
}
