-- Inbox: staging area in front of the tracker.
-- Additive only — nothing here touches existing tracker data.

CREATE TYPE "remote_mode" AS ENUM ('onsite', 'hybrid', 'remote', 'unclear');
CREATE TYPE "job_posting_status" AS ENUM ('new', 'extracting', 'failed', 'dismissed', 'promoted');

-- Landing fields for postings promoted into the tracker.
ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "role" text,
  ADD COLUMN IF NOT EXISTS "stack" text[],
  ADD COLUMN IF NOT EXISTS "comp_min" integer,
  ADD COLUMN IF NOT EXISTS "comp_max" integer,
  ADD COLUMN IF NOT EXISTS "location" text,
  ADD COLUMN IF NOT EXISTS "remote" "remote_mode";

CREATE TABLE "job_postings" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id"),
  "source_url" text,
  "raw_text" text NOT NULL,
  "content_hash" text NOT NULL,
  "status" "job_posting_status" DEFAULT 'new' NOT NULL,
  "failure_reason" text,
  "dismissed_reason" text,
  "promoted_opportunity_id" integer REFERENCES "opportunities"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "job_posting_user_hash_unique" UNIQUE("user_id", "content_hash")
);

CREATE TABLE "job_extractions" (
  "id" serial PRIMARY KEY NOT NULL,
  "posting_id" integer NOT NULL REFERENCES "job_postings"("id") ON DELETE CASCADE,
  "role" text,
  "company" text,
  "stack" text[],
  "comp_min" integer,
  "comp_max" integer,
  "comp_currency" text,
  "location" text,
  "remote" "remote_mode" DEFAULT 'unclear' NOT NULL,
  "deadline" date,
  "seniority" text,
  "model" text NOT NULL,
  "prompt_version" text NOT NULL,
  "attempt_count" integer DEFAULT 1 NOT NULL,
  "retried_rule" text,
  "raw_response" jsonb,
  "input_tokens" integer,
  "output_tokens" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "job_extraction_posting_unique" UNIQUE("posting_id")
);

CREATE TABLE "user_profiles" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "user"("id"),
  "stack" text[],
  "target_comp_min" integer,
  "target_comp_max" integer,
  "comp_currency" text DEFAULT 'INR' NOT NULL,
  "preferred_locations" text[],
  "remote_preference" "remote_mode" DEFAULT 'unclear' NOT NULL,
  "available_from" date,
  "seniority" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "match_scores" (
  "id" serial PRIMARY KEY NOT NULL,
  "posting_id" integer NOT NULL REFERENCES "job_postings"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "user"("id"),
  "total" integer NOT NULL,
  "breakdown" jsonb NOT NULL,
  "rubric_version" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "match_score_posting_user_unique" UNIQUE("posting_id", "user_id")
);

-- The Inbox lists a user's postings newest-first, filtered by status.
CREATE INDEX "job_postings_user_status_idx" ON "job_postings" ("user_id", "status", "created_at" DESC);
