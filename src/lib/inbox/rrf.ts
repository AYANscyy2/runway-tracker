/**
 * Reciprocal rank fusion, kept free of any database import so it can be tested
 * on its own.
 *
 * Each engine contributes 1/(k + rank) for every result it returns, and the
 * contributions are summed. Fusing ranks rather than scores is the point: a
 * cosine distance and a ts_rank are not on comparable scales, and normalising
 * them means choosing a weighting that is wrong for some queries. Rank
 * position is directly comparable, so a result both engines merely like rises
 * above one that either engine loves alone.
 */
export const RRF_K = 60;

export type Engine = "keyword" | "semantic";

export type FusedHit = {
  postingId: number;
  score: number;
  matchedBy: Engine[];
  snippet: string | null;
  section: string | null;
};

export type RankedList = {
  engine: Engine;
  results: { postingId: number; snippet?: string; section?: string }[];
};

export function fuse(lists: RankedList[]): FusedHit[] {
  const fused = new Map<number, FusedHit>();

  for (const { engine, results } of lists) {
    results.forEach((r, i) => {
      const contribution = 1 / (RRF_K + i + 1);
      const hit = fused.get(r.postingId);
      if (hit) {
        hit.score += contribution;
        hit.matchedBy.push(engine);
        // Prefer the keyword snippet: a literal match explains itself better
        // than a merely semantically close paragraph.
        if (engine === "keyword" && r.snippet) { hit.snippet = r.snippet; hit.section = r.section ?? null; }
      } else {
        fused.set(r.postingId, {
          postingId: r.postingId,
          score: contribution,
          matchedBy: [engine],
          snippet: r.snippet ?? null,
          section: r.section ?? null,
        });
      }
    });
  }

  return [...fused.values()].sort((a, b) => b.score - a.score);
}
