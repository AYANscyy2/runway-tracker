-- Semantic + keyword search over inbox postings.
-- drizzle-kit emits neither the extension nor the vector indexes, so this
-- migration is hand-written.
--
-- Every statement is guarded so this can run after `db:push` (which already
-- creates the table and the posting index from schema.ts) as well as after
-- 001_inbox.sql on a network where drizzle-kit can't connect.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "job_chunks" (
  "id" serial PRIMARY KEY NOT NULL,
  "posting_id" integer NOT NULL REFERENCES "job_postings"("id") ON DELETE CASCADE,
  "chunk_index" integer NOT NULL,
  "section" text NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(768),
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "job_chunk_posting_index_unique" UNIQUE("posting_id", "chunk_index")
);

-- Keyword half of the hybrid search. Generated rather than maintained by the
-- app, so it can never drift from `content`. The section label is weighted
-- lower than the body: matching the word "Requirements" should not outrank
-- matching an actual requirement.
ALTER TABLE "job_chunks"
  ADD COLUMN IF NOT EXISTS "search" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("content", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("section", '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS "job_chunks_search_idx" ON "job_chunks" USING GIN ("search");

-- Vector half. HNSW with cosine distance, matching the operator the query uses.
CREATE INDEX IF NOT EXISTS "job_chunks_embedding_idx"
  ON "job_chunks" USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "job_chunks_posting_idx" ON "job_chunks" ("posting_id");
