const CITATION = /\[Source\s+(\d+)\]/gi;

/** Unique 1-based source numbers, in the order they first appear. */
export function parseCitations(answer: string): number[] {
  const seen = new Set<number>();
  const ordered: number[] = [];

  for (const match of answer.matchAll(CITATION)) {
    const n = Number(match[1]);
    if (!Number.isInteger(n) || n < 1 || seen.has(n)) continue;
    seen.add(n);
    ordered.push(n);
  }

  return ordered;
}
