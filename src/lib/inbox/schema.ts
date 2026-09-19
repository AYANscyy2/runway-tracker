import { z } from "zod";

/** Bump when the prompt or schema changes, so old rows stay interpretable. */
export const PROMPT_VERSION = "2026-09-20.1";

/**
 * Mirrors the job_extractions columns. Everything is nullable: a JD that
 * doesn't state the salary should come back with nulls, not an invented range.
 */
export const extractionSchema = z.object({
  role: z.string().nullable().describe("The job title, e.g. 'Backend Engineer'. Null if not stated."),
  company: z.string().nullable().describe("Hiring company name. Null if not stated."),
  stack: z.array(z.string()).describe(
    "Technologies explicitly named in the posting — languages, frameworks, databases, cloud. Lowercase, one per entry. Empty array if none are named.",
  ),
  compMin: z.number().int().nullable().describe("Lower bound of annual compensation as a plain number, no commas or units. Null if not stated."),
  compMax: z.number().int().nullable().describe("Upper bound of annual compensation. Equal to compMin for a single figure. Null if not stated."),
  compCurrency: z.string().nullable().describe("ISO code of the compensation currency, e.g. INR or USD. Null if no compensation is stated."),
  location: z.string().nullable().describe("City and/or country as written. Null if not stated."),
  remote: z.enum(["onsite", "hybrid", "remote", "unclear"]).describe(
    "Use 'unclear' unless the posting actually says. Do not infer remote from the company being a startup.",
  ),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe("Application deadline as YYYY-MM-DD. Null if not stated."),
  seniority: z.string().nullable().describe("e.g. intern, junior, mid, senior, staff. Null if not stated."),
});

export type Extraction = z.infer<typeof extractionSchema>;

export const SYSTEM_PROMPT = `You extract structured data from job descriptions.

Rules:
- Only report what the posting actually says. Never guess, never fill a field
  from what is typical for this kind of role.
- If something is absent or ambiguous, return null (or "unclear" for remote).
  A null is always better than a plausible invention.
- Compensation is annual. Convert stated monthly or per-lakh figures to an
  annual plain number: "12 LPA" is 1200000, "50k/month" is 600000.
- Stack means technologies named in the text, not skills like "communication".`;
