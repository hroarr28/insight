/** Share of the relevant set that appears in the first k retrieved ids. */
export function recallAtK(
  retrieved: string[],
  relevant: ReadonlySet<string>,
  k: number
): number {
  if (!Number.isInteger(k) || k < 1) {
    throw new Error("k must be a positive integer");
  }
  if (relevant.size === 0) return 0;

  const seen = new Set<string>();
  for (const id of retrieved.slice(0, k)) {
    if (relevant.has(id)) seen.add(id);
  }
  return seen.size / relevant.size;
}

/** 1 / rank of the first relevant id, or 0 when none of the ranking is relevant. */
export function reciprocalRank(
  retrieved: string[],
  relevant: ReadonlySet<string>
): number {
  for (let index = 0; index < retrieved.length; index += 1) {
    if (relevant.has(retrieved[index])) return 1 / (index + 1);
  }
  return 0;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Unique citations that land on a relevant shown chunk, divided by the number of citations.
 * A citation with no matching shown chunk counts as wrong. No citations score 0.
 */
export function citationAccuracy(
  cited: number[],
  shownIds: string[],
  relevant: ReadonlySet<string>
): number {
  if (cited.length === 0) return 0;
  let correct = 0;
  for (const sourceNumber of cited) {
    const id = shownIds[sourceNumber - 1];
    if (id && relevant.has(id)) correct += 1;
  }
  return correct / cited.length;
}
