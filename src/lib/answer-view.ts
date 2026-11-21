export const RETRIEVAL_EMPTY_LINE = "Answers are retrieved from the sample documents.";

export type AnswerPiece =
  | { type: "text"; text: string }
  | { type: "citation"; label: string; source: number };

const CITATION_GROUP = /\[(?:\s*Source\s+\d+\s*,?\s*)+\]|\bSource\s+\d+\b/gi;
const SOURCE_NUMBER = /Source\s+(\d+)/gi;

export function retrievalLine(count: number): string {
  const label = count === 1 ? "passage" : "passages";
  return `Answered from ${count} ${label} in your documents`;
}

/** Source cards stay open until this message id is added to the collapsed set. */
export function sourceCardsOpen(
  collapsedMessageIds: ReadonlySet<string>,
  messageId: string,
  sourceCount: number
): boolean {
  return sourceCount > 0 && !collapsedMessageIds.has(messageId);
}

export function sourceElementId(messageId: string, source: number): string {
  return `source-${messageId}-${source}`;
}

function pushCitation(pieces: AnswerPiece[], raw: string): void {
  const numbers = [...raw.matchAll(new RegExp(SOURCE_NUMBER.source, "gi"))];
  if (numbers.length === 0) {
    pieces.push({ type: "text", text: raw });
    return;
  }
  let local = 0;
  for (const number of numbers) {
    const index = number.index ?? 0;
    if (index > local) pieces.push({ type: "text", text: raw.slice(local, index) });
    pieces.push({
      type: "citation",
      label: number[0],
      source: Number(number[1]),
    });
    local = index + number[0].length;
  }
  if (local < raw.length) pieces.push({ type: "text", text: raw.slice(local) });
}

/** Splits [Source n] marks so each one can scroll to the matching source card. */
export function answerPieces(text: string): AnswerPiece[] {
  const pieces: AnswerPiece[] = [];
  const pattern = new RegExp(CITATION_GROUP.source, "gi");
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) pieces.push({ type: "text", text: text.slice(cursor, start) });
    pushCitation(pieces, match[0]);
    cursor = start + match[0].length;
  }
  if (cursor < text.length) pieces.push({ type: "text", text: text.slice(cursor) });
  if (pieces.length === 0) pieces.push({ type: "text", text });
  return pieces;
}
