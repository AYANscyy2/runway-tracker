import { type AnyPgColumn, pgTable, serial, text, timestamp, date, pgEnum, integer, boolean, jsonb, unique, vector, index } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull(),
	image: text("image"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull()
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull().references(() => user.id)
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull().references(() => user.id),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull()
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at"),
	updatedAt: timestamp("updated_at")
});

/**
 * Two kinds of things land in this tracker: job/off-campus leads and hackathons.
 * They share the same pipeline shape (found -> applied -> in progress -> result),
 * so one table with a `type` discriminator is enough — no need for two tables
 * that would just duplicate every column.
 */
export const opportunityType = pgEnum("opportunity_type", ["job", "hackathon"]);

/** How on-site a role is. Shared by opportunities, extractions and profiles. */
export const remoteMode = pgEnum("remote_mode", ["onsite", "hybrid", "remote", "unclear"]);

export const opportunityStatus = pgEnum("opportunity_status", [
  "found", // saw it, haven't acted yet
  "applied", // application/registration submitted
  "oa_assignment", // OA / Assignment
  "in_progress", // interviewing, or hacking/judging in progress
  "selected", // offer / shortlisted / won
  "rejected", // didn't go through
  "hackathon_active", // hackathon active
]);

/**
 * The opportunity itself (company/hackathon info). Owned by one user via
 * `createdBy`; the per-user pipeline fields live in userOpportunityTracking.
 */
export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  type: opportunityType("type").notNull().default("job"),
  name: text("name").notNull(), // company name, or hackathon name
  source: text("source"), // LinkedIn, Devfolio, Unstop, referral, etc.
  deadline: date("deadline"), // application deadline or event date
  // Filled in when an opportunity is promoted from an Inbox posting. These are
  // a snapshot taken at promotion time, not a live join — editing the tracker
  // entry shouldn't be second-guessed by whatever the model originally read.
  role: text("role"),
  stack: text("stack").array(),
  compMin: integer("comp_min"),
  compMax: integer("comp_max"),
  location: text("location"),
  remote: remoteMode("remote"),
  compCurrency: text("comp_currency"),
  // Owner. Opportunities are private — every read and mutation is scoped to
  // this. Nullable only because rows predating the column exist; backfill
  // them and treat null as "belongs to nobody".
  createdBy: text("created_by").references(() => user.id),
  // Set by Delete; cleared by Undo. Rows past the undo window are purged.
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;

/**
 * Per-user tracking for each opportunity.
 * Each user has their own status, notes, follow-up dates, etc.
 */
export const userOpportunityTracking = pgTable("user_opportunity_tracking", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id),
  opportunityId: integer("opportunity_id")
    .references(() => opportunities.id, { onDelete: "cascade" })
    .notNull(),
  status: opportunityStatus("status").notNull().default("found"),
  foundDate: date("found_date"),
  followUpDate: date("follow_up_date"),
  referralContact: text("referral_contact"),
  nextAction: text("next_action"),
  notes: text("notes"),
  // When `status` last changed. Drives "hasn't moved in N days" — editing a
  // note or fixing a link is not progress, so updatedAt can't be used.
  statusChangedAt: timestamp("status_changed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("user_opp_unique").on(table.userId, table.opportunityId),
]);

export type UserOpportunityTracking = typeof userOpportunityTracking.$inferSelect;
export type NewUserOpportunityTracking = typeof userOpportunityTracking.$inferInsert;

export const opportunityUrls = pgTable("opportunity_urls", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id")
    .references(() => opportunities.id, { onDelete: "cascade" })
    .notNull(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type OpportunityUrl = typeof opportunityUrls.$inferSelect;
export type NewOpportunityUrl = typeof opportunityUrls.$inferInsert;

/** Merged view: opportunity + the owner's tracking + urls */
export type OpportunityWithUrls = Opportunity & {
  status: UserOpportunityTracking["status"];
  foundDate: string | null;
  followUpDate: string | null;
  referralContact: string | null;
  nextAction: string | null;
  notes: string | null;
  trackingId: number | null;
  /** When the status last changed. Drives staleness. */
  trackedAt: Date | null;
  urls: OpportunityUrl[];
};

/* ────────────────────────────── Inbox ──────────────────────────────
 * A staging area in front of the tracker: paste a job description, have it
 * parsed into fields, score it against your profile, then either promote it
 * into `opportunities` or dismiss it. Entirely per-user and entirely separate
 * from the tracker's query path — nothing here is read while rendering the
 * tracker table.
 */

/** Where a posting sits. `extracting` is written *before* the model is called
 * so a crash or timeout leaves a visible row rather than nothing. */
export const jobPostingStatus = pgEnum("job_posting_status", [
  "new",
  "extracting",
  "failed",
  "dismissed",
  "promoted",
]);

export const jobPostings = pgTable("job_postings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id),
  sourceUrl: text("source_url"), // null when the text was pasted directly
  rawText: text("raw_text").notNull(),
  // Hash of rawText, so re-pasting the same JD updates rather than duplicates.
  contentHash: text("content_hash").notNull(),
  status: jobPostingStatus("status").notNull().default("new"),
  failureReason: text("failure_reason"), // why extraction failed, shown on the card
  dismissedReason: text("dismissed_reason"),
  promotedOpportunityId: integer("promoted_opportunity_id")
    .references(() => opportunities.id, { onDelete: "set null" }),
  // The fetched page's <title>. Kept so a re-extraction sees the same hint —
  // a hackathon's name is often only in the title.
  pageTitle: text("page_title"),
  // Set when another posting in this inbox looks like the same thing (same
  // URL, or same company and role). Advisory: the card offers a dismiss.
  duplicateOfId: integer("duplicate_of_id").references((): AnyPgColumn => jobPostings.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("job_posting_user_hash_unique").on(table.userId, table.contentHash),
]);

export type JobPosting = typeof jobPostings.$inferSelect;
export type NewJobPosting = typeof jobPostings.$inferInsert;

/** What the model (or a hand-filled form) pulled out of a posting, plus the
 * provenance needed to debug a bad extraction later. One row per posting. */
export const postingKind = pgEnum("posting_kind", ["job", "hackathon"]);

export const jobExtractions = pgTable("job_extractions", {
  id: serial("id").primaryKey(),
  postingId: integer("posting_id")
    .references(() => jobPostings.id, { onDelete: "cascade" })
    .notNull(),
  kind: postingKind("kind").notNull().default("job"),
  role: text("role"),
  company: text("company"),
  stack: text("stack").array(),
  compMin: integer("comp_min"),
  compMax: integer("comp_max"),
  compCurrency: text("comp_currency"),
  location: text("location"),
  remote: remoteMode("remote").notNull().default("unclear"),
  deadline: date("deadline"),
  seniority: text("seniority"),
  // Hackathon-only. For a hackathon, `company` is the organiser, `deadline`
  // the submission deadline and `remote` the format (remote = online).
  eventName: text("event_name"),
  prizeAmount: integer("prize_amount"),
  prizeCurrency: text("prize_currency"),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  teamSizeMax: integer("team_size_max"),
  eligibility: text("eligibility"),
  themes: text("themes").array(),
  // Provenance. `model` is "manual" for hand-filled entries.
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  attemptCount: integer("attempt_count").notNull().default(1),
  // Which post-validation rule forced a retry, if any (e.g. "comp_out_of_range").
  retriedRule: text("retried_rule"),
  rawResponse: jsonb("raw_response"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("job_extraction_posting_unique").on(table.postingId),
]);

export type JobExtraction = typeof jobExtractions.$inferSelect;
export type NewJobExtraction = typeof jobExtractions.$inferInsert;

/** What you're looking for. Drives the deterministic half of the match score. */
export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey().references(() => user.id),
  stack: text("stack").array(),
  targetCompMin: integer("target_comp_min"),
  targetCompMax: integer("target_comp_max"),
  compCurrency: text("comp_currency").notNull().default("INR"),
  preferredLocations: text("preferred_locations").array(),
  remotePreference: remoteMode("remote_preference").notNull().default("unclear"),
  availableFrom: date("available_from"),
  seniority: text("seniority"),
  notes: text("notes"), // free text handed to the model for the fuzzy-fit dimension
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;

/** Per-dimension scores, never a bare number — a score you can't explain is a
 * score you won't trust. `breakdown` holds { dimension: { score, reason } }. */
export const matchScores = pgTable("match_scores", {
  id: serial("id").primaryKey(),
  postingId: integer("posting_id")
    .references(() => jobPostings.id, { onDelete: "cascade" })
    .notNull(),
  userId: text("user_id").notNull().references(() => user.id),
  total: integer("total").notNull(),
  breakdown: jsonb("breakdown").$type<MatchBreakdown>().notNull(),
  rubricVersion: text("rubric_version").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("match_score_posting_user_unique").on(table.postingId, table.userId),
]);

export type MatchDimension = { score: number; max: number; reason: string };
export type MatchBreakdown = {
  stack: MatchDimension;
  comp: MatchDimension;
  location: MatchDimension;
  startDate: MatchDimension;
  fit: MatchDimension;
  /** Hash of the inputs the fit dimension was computed from. Lets a rescore
   * reuse the stored fit instead of spending another model call when nothing
   * it depends on has changed. */
  fitKey?: string;
};

export type MatchScore = typeof matchScores.$inferSelect;
export type NewMatchScore = typeof matchScores.$inferInsert;

/**
 * The score a card shows. Every dimension except fit is recomputed from the
 * extraction and the current profile on each read, so "deadline passed" and
 * profile edits are never stale; only fit comes from the stored row.
 */
export type CardScore = {
  total: number;
  breakdown: MatchBreakdown;
  /** Fit has not been assessed for the current profile — shown as neutral. */
  fitPending: boolean;
};

/** What the Inbox tab renders: a posting with its extraction and score. */
export type InboxCard = JobPosting & {
  extraction: JobExtraction | null;
  score: CardScore | null;
};

/**
 * A posting split into its sections, each embedded for semantic search. Split
 * by section rather than by a fixed token window: job descriptions are highly
 * repetitive across companies, so a window that straddles "about us" and
 * "requirements" produces a vector that matches everything and distinguishes
 * nothing.
 *
 * The `search` tsvector column is generated in the database (see
 * sql/002_search.sql) so it cannot drift from `content`; Drizzle doesn't model
 * it, and the search query reaches for it with raw SQL.
 */
export const jobChunks = pgTable("job_chunks", {
  id: serial("id").primaryKey(),
  postingId: integer("posting_id")
    .references(() => jobPostings.id, { onDelete: "cascade" })
    .notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  section: text("section").notNull(),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 768 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  unique("job_chunk_posting_index_unique").on(table.postingId, table.chunkIndex),
  index("job_chunks_posting_idx").on(table.postingId),
]);

export type JobChunk = typeof jobChunks.$inferSelect;
export type NewJobChunk = typeof jobChunks.$inferInsert;
