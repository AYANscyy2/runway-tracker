import { pgTable, serial, text, timestamp, date, pgEnum } from "drizzle-orm/pg-core";

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
  "in_progress", // interviewing, or hacking/judging in progress
  "selected", // offer / shortlisted / won
  "rejected", // didn't go through
]);

export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  type: opportunityType("type").notNull().default("job"),
  name: text("name").notNull(), // company name, or hackathon name
  source: text("source"), // LinkedIn, Devfolio, Unstop, referral, etc.
  link: text("link"), // posting / registration URL
  deadline: date("deadline"), // application deadline or event date
  status: opportunityStatus("status").notNull().default("found"),
  referralContact: text("referral_contact"),
  nextAction: text("next_action"), // what you need to do next, in your own words
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
