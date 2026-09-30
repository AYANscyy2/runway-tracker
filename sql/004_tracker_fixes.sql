-- Tracker: staleness measured from the last *status* change rather than any
-- edit, and soft delete so a delete is saved at once and Undo can restore it.
-- Additive and guarded, so it is safe to re-run.

ALTER TABLE "user_opportunity_tracking"
  ADD COLUMN IF NOT EXISTS "status_changed_at" timestamp;

-- Best available history for existing rows: the last time the row changed.
UPDATE "user_opportunity_tracking"
  SET "status_changed_at" = "updated_at"
  WHERE "status_changed_at" IS NULL;

ALTER TABLE "user_opportunity_tracking"
  ALTER COLUMN "status_changed_at" SET DEFAULT now(),
  ALTER COLUMN "status_changed_at" SET NOT NULL;

ALTER TABLE "opportunities"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

CREATE INDEX IF NOT EXISTS "opportunities_owner_live_idx"
  ON "opportunities" ("created_by") WHERE "deleted_at" IS NULL;
