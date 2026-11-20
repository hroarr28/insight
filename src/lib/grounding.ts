export function formatContext(
  chunks: { content: string; document_name: string; chunk_index: number }[]
): string {
  if (chunks.length === 0) return "No relevant documents found.";
  return chunks
    .map(
      (chunk, index) =>
        `[Source ${index + 1}: ${chunk.document_name}, chunk ${chunk.chunk_index}]\n${chunk.content}`
    )
    .join("\n\n---\n\n");
}

export function buildSystemPrompt(context: string): string {
  return `You are Insight, an AI assistant that answers questions based on uploaded documents.

RULES:
- Answer ONLY using the provided context. Do not use external knowledge.
- If the context doesn't contain enough information, say so clearly.
- Reference your sources using [Source N] notation.
- Be concise and direct.
- Use markdown formatting for clarity.
- If the question is about something not in the documents, explain that you can only answer based on uploaded content.

CONTEXT FROM DOCUMENTS:
${context}`;
}
