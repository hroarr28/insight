export interface FusedRank {
  id: string;
  score: number;
}

/**
 * Reciprocal rank fusion (Cormack, Clarke, Buettcher).
 * score(id) = sum over lists of 1 / (k + rank), rank starting at 1.
 * Duplicate ids inside a single list count once, at their first rank.
 * Ties break by id so the order is stable.
 */
export function reciprocalRankFusion(
  rankings: string[][],
  k = 60
): FusedRank[] {
  if (!Number.isFinite(k) || k < 0) {
    throw new Error("RRF k must be a finite number greater than or equal to 0");
  }

  const scores = new Map<string, number>();

  for (const ranking of rankings) {
    const seen = new Set<string>();
    ranking.forEach((id, index) => {
      if (seen.has(id)) return;
      seen.add(id);
      const next = (scores.get(id) ?? 0) + 1 / (k + index + 1);
      scores.set(id, next);
    });
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
