export interface Chunk {
  content: string;
  index: number;
  metadata: {
    page?: number;
    heading?: string;
  };
}

// chunkSize is a character budget. overlap is a word count.
// That mismatch is the production baseline the eval measures.
const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 50;

export type ChunkingStrategy =
  | "paragraph-500-50"
  | "paragraph-1000-100"
  | "heading-aware";

export const CHUNKING_STRATEGIES: ChunkingStrategy[] = [
  "paragraph-500-50",
  "paragraph-1000-100",
  "heading-aware",
];

export function isHeadingParagraph(trimmed: string): boolean {
  return (
    /^#{1,3}\s/.test(trimmed) ||
    (trimmed.length < 80 && trimmed === trimmed.toUpperCase())
  );
}

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
    if (isHeadingParagraph(trimmed)) {
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

export interface MarkdownSection {
  heading: string;
  body: string;
}

/** Split on markdown headings only. All-caps lines stay inside the section body. */
export function splitMarkdownSections(text: string): MarkdownSection[] {
  const sections: { heading: string; lines: string[] }[] = [];
  let current = { heading: "", lines: [] as string[] };

  for (const line of text.split("\n")) {
    const match = /^(#{1,3})\s+(\S.*)$/.exec(line);
    if (match) {
      sections.push(current);
      current = { heading: match[2].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);

  return sections
    .map((section) => ({
      heading: section.heading,
      body: section.lines.join("\n").trim(),
    }))
    .filter((section) => section.heading.length > 0 || section.body.length > 0);
}

/**
 * Same character budget and word overlap as the baseline, but each markdown
 * section is chunked on its own so a heading does not stick to the previous section.
 * The heading is stored on every chunk from that section. It is also written
 * once, at the start of the section text, which is what the vector embedder sees.
 */
export function chunkHeadingAware(
  text: string,
  options?: { chunkSize?: number; overlap?: number }
): Chunk[] {
  const chunkSize = options?.chunkSize ?? CHUNK_SIZE;
  const overlap = options?.overlap ?? CHUNK_OVERLAP;
  const chunks: Chunk[] = [];

  for (const section of splitMarkdownSections(text)) {
    const body = section.heading
      ? `${section.heading}\n\n${section.body}`.trim()
      : section.body;
    if (!body) continue;

    const parts = chunkText(body, { chunkSize, overlap });
    for (const part of parts) {
      chunks.push({
        content: part.content,
        index: chunks.length,
        metadata: {
          heading: section.heading || part.metadata.heading,
        },
      });
    }
  }

  return chunks;
}

export function chunkWithStrategy(text: string, strategy: ChunkingStrategy): Chunk[] {
  switch (strategy) {
    case "paragraph-500-50":
      return chunkText(text, { chunkSize: 500, overlap: 50 });
    case "paragraph-1000-100":
      return chunkText(text, { chunkSize: 1000, overlap: 100 });
    case "heading-aware":
      return chunkHeadingAware(text);
  }
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  return data.text;
}
