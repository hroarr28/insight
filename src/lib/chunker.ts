export interface Chunk {
  content: string;
  index: number;
  metadata: {
    page?: number;
    heading?: string;
  };
}

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

export function chunkText(
  text: string,
  options?: { chunkSize?: number; overlap?: number }
): Chunk[] {
  const chunkSize = options?.chunkSize ?? CHUNK_SIZE;
  const overlap = options?.overlap ?? CHUNK_OVERLAP;
  const chunks: Chunk[] = [];

  // Split by paragraphs first for natural breaks
  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = "";
  let chunkIndex = 0;
  let currentHeading = "";

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    // Track headings (markdown or caps lines)
    if (/^#{1,3}\s/.test(trimmed) || (trimmed.length < 80 && trimmed === trimmed.toUpperCase())) {
      currentHeading = trimmed.replace(/^#+\s*/, "");
    }

    // If adding this paragraph would exceed chunk size, save current and start new
    if (currentChunk.length + trimmed.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex++,
        metadata: { heading: currentHeading || undefined },
      });

      // Keep overlap from end of previous chunk
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-overlap);
      currentChunk = overlapWords.join(" ") + "\n\n" + trimmed;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      metadata: { heading: currentHeading || undefined },
    });
  }

  return chunks;
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  return data.text;
}
