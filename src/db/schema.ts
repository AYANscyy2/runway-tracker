import { pgTable, serial, text, timestamp, date, pgEnum, integer, boolean, unique } from "drizzle-orm/pg-core";

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
 * Shared opportunity record — visible to all users.
 * Contains only the company/hackathon info, not personal tracking data.
 */
export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  type: opportunityType("type").notNull().default("job"),
  name: text("name").notNull(), // company name, or hackathon name
  source: text("source"), // LinkedIn, Devfolio, Unstop, referral, etc.
  deadline: date("deadline"), // application deadline or event date
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

/** Merged view: shared opportunity + user's tracking + urls */
export type OpportunityWithUrls = Opportunity & {
  status: UserOpportunityTracking["status"];
  foundDate: string | null;
  followUpDate: string | null;
  referralContact: string | null;
  nextAction: string | null;
  notes: string | null;
  trackingId: number | null;
  urls: OpportunityUrl[];
};
