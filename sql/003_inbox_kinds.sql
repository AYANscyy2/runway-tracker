-- Inbox: hackathons as a first-class kind, duplicate tracking, and the page
-- title kept for re-extraction. Additive and guarded, so it is safe to re-run.

DO $$ BEGIN
  CREATE TYPE "posting_kind" AS ENUM ('job', 'hackathon');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "job_postings"
  ADD COLUMN IF NOT EXISTS "page_title" text,
  ADD COLUMN IF NOT EXISTS "duplicate_of_id" integer REFERENCES "job_postings"("id") ON DELETE SET NULL;

ALTER TABLE "job_extractions"
  ADD COLUMN IF NOT EXISTS "kind" "posting_kind" DEFAULT 'job' NOT NULL,
  ADD COLUMN IF NOT EXISTS "event_name" text,
  ADD COLUMN IF NOT EXISTS "prize_amount" integer,
  ADD COLUMN IF NOT EXISTS "prize_currency" text,
  ADD COLUMN IF NOT EXISTS "starts_on" date,
  ADD COLUMN IF NOT EXISTS "ends_on" date,
  ADD COLUMN IF NOT EXISTS "team_size_max" integer,
  ADD COLUMN IF NOT EXISTS "eligibility" text,
  ADD COLUMN IF NOT EXISTS "themes" text[];

-- A promoted posting's pay was copied without its currency, so a USD figure
-- read as rupees.
ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "comp_currency" text;
