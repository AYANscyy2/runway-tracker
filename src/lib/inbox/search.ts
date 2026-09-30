import { sql } from "drizzle-orm";
import { db } from "@/db";
import { jobChunks, jobPostings } from "@/db/schema";
import { embedQuery } from "./embed";
import { fuse, type FusedHit } from "./rrf";

/**
 * Cosine distance beyond which a chunk is not a match at all.
 *
 * Vector search always returns its nearest neighbours, however far away they
 * are, so without a cutoff a query for "kubernetes" returns every posting in
 * the inbox ranked by irrelevance. Measured against real postings: genuine
 * matches sit at 0.34-0.40 and unrelated text at 0.44 and above, so this
 * splits them — tightly enough that it will need revisiting if the corpus or
 * the embedding model changes.
 */
const MAX_SEMANTIC_DISTANCE = 0.42;

/** How deep each engine goes before fusion. Wide enough that a result ranked
 * mid-table by one engine can still win on agreement. */
const CANDIDATES = 50;

/** Fused hit plus the engines that found it, so the UI can say why something
 * surfaced. */
export type SearchHit = FusedHit;

type Ranked = { postingId: number; snippet: string; section: string };

/** Keyword half: Postgres full-text over the generated tsvector column.
 * websearch_to_tsquery handles quoted phrases and `-exclusions` the way a
 * search box user expects. */
async function keywordSearch(userId: string, query: string): Promise<Ranked[]> {
  // DISTINCT ON needs posting_id first in its ORDER BY, which is the wrong
  // order for ranking — so it only picks each posting's best chunk, and the
  // outer query ranks those. Without the outer ORDER BY, fusion would see the
  // results in posting-id order and LIMIT would keep the oldest postings.
  const rows = await db.execute<{ posting_id: number; content: string; section: string }>(sql`
    SELECT posting_id, content, section FROM (
      SELECT DISTINCT ON (c.posting_id)
             c.posting_id, c.content, c.section,
             ts_rank(c.search, websearch_to_tsquery('english', ${query})) AS rank
      FROM ${jobChunks} c
      JOIN ${jobPostings} p ON p.id = c.posting_id
      WHERE p.user_id = ${userId}
        AND c.search @@ websearch_to_tsquery('english', ${query})
      ORDER BY c.posting_id, rank DESC
    ) best
    ORDER BY rank DESC
    LIMIT ${CANDIDATES}
  `);
  return rows.rows.map((r) => ({ postingId: r.posting_id, snippet: r.content, section: r.section }));
}

/** Vector half: cosine distance against the query embedding, best chunk per
 * posting so one verbose posting can't fill the page. */
async function semanticSearch(userId: string, query: string): Promise<Ranked[]> {
  const embedding = await embedQuery(query);
  const literal = `[${embedding.join(",")}]`;
  const rows = await db.execute<{ posting_id: number; content: string; section: string }>(sql`
    SELECT posting_id, content, section FROM (
      SELECT DISTINCT ON (c.posting_id)
             c.posting_id, c.content, c.section,
             c.embedding <=> ${literal}::vector AS distance
      FROM ${jobChunks} c
      JOIN ${jobPostings} p ON p.id = c.posting_id
      WHERE p.user_id = ${userId}
        AND c.embedding IS NOT NULL
        AND c.embedding <=> ${literal}::vector < ${MAX_SEMANTIC_DISTANCE}
      ORDER BY c.posting_id, distance ASC
    ) best
    ORDER BY distance ASC
    LIMIT ${CANDIDATES}
  `);
  return rows.rows.map((r) => ({ postingId: r.posting_id, snippet: r.content, section: r.section }));
}

export async function hybridSearch(userId: string, rawQuery: string): Promise<SearchHit[]> {
  const query = rawQuery.trim();
  if (!query) return [];

  // Run both halves; a failing semantic half (quota, outage) degrades to
  // keyword-only rather than returning nothing.
  const [keyword, semantic] = await Promise.all([
    keywordSearch(userId, query).catch((e) => {
      console.warn("[inbox] keyword search failed:", e instanceof Error ? e.message : e);
      return [] as Ranked[];
    }),
    semanticSearch(userId, query).catch((e) => {
      console.warn("[inbox] semantic search failed:", e instanceof Error ? e.message : e);
      return [] as Ranked[];
    }),
  ]);

  return fuse([
    { engine: "keyword", results: keyword },
    { engine: "semantic", results: semantic },
  ]);
}

