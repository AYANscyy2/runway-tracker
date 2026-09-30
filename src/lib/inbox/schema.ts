import { z } from "zod";

/** Bump when the prompt or schema changes, so old rows stay interpretable. */
export const PROMPT_VERSION = "2026-09-30.1";

const isoDate = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

/**
 * Mirrors the job_extractions columns. Everything is nullable: a JD that
 * doesn't state the salary should come back with nulls, not an invented range.
 *
 * Jobs and hackathons share one shape because they share one pipeline. For a
 * hackathon the job-only fields stay null and the event fields are filled.
 */
export const extractionSchema = z.object({
  kind: z.enum(["job", "hackathon"]).describe(
    "'hackathon' for a hackathon, buildathon, coding contest or similar event with submissions and prizes; 'job' for a job or internship posting.",
  ),
  role: z.string().nullable().describe("Jobs only: the job title, e.g. 'Backend Engineer'. Null for a hackathon or if not stated."),
  company: z.string().nullable().describe("Hiring company, or for a hackathon the organiser/sponsor. Null if not stated."),
  eventName: z.string().nullable().describe("Hackathons only: the event's name, e.g. 'Amazon Appstore Dev Hackathon 2026'. Null for a job."),
  stack: z.array(z.string()).describe(
    "Technologies explicitly named — languages, frameworks, databases, cloud, APIs. For a hackathon, the suggested or required tools. Lowercase, one per entry. Empty array if none are named.",
  ),
  compMin: z.number().int().nullable().describe("Jobs only: lower bound of annual compensation as a plain number, no commas or units. Null for a hackathon or if not stated."),
  compMax: z.number().int().nullable().describe("Jobs only: upper bound of annual compensation. Equal to compMin for a single figure. Null if not stated."),
  compCurrency: z.string().nullable().describe("ISO code of the compensation currency, e.g. INR or USD. Null if no compensation is stated."),
  prizeAmount: z.number().int().nullable().describe("Hackathons only: total prize pool (cash value) as a plain number. Null if not stated or for a job."),
  prizeCurrency: z.string().nullable().describe("ISO code of the prize currency. Null if no prize is stated."),
  location: z.string().nullable().describe("City and/or country where the work or event happens, as written. Not a company's legal or mailing address. Null if not stated."),
  remote: z.enum(["onsite", "hybrid", "remote", "unclear"]).describe(
    "Jobs: the work setup. Hackathons: 'remote' for online, 'onsite' for in-person, 'hybrid' for both. Use 'unclear' unless the text actually says. Do not infer remote from the company being a startup.",
  ),
  deadline: isoDate().describe("Jobs: application deadline. Hackathons: submission deadline. YYYY-MM-DD. Null if not stated."),
  startsOn: isoDate().describe("Hackathons only: when the event or submission period starts, YYYY-MM-DD. Null if not stated."),
  endsOn: isoDate().describe("Hackathons only: when the event ends (or judging/results if that is the only end date), YYYY-MM-DD. Null if not stated."),
  teamSizeMax: z.number().int().nullable().describe("Hackathons only: maximum team size. Null if not stated."),
  eligibility: z.string().nullable().describe(
    "Hackathons only: who may enter, in under 20 words — e.g. 'US residents 18+', 'students only', 'open worldwide'. Null if not stated.",
  ),
  themes: z.array(z.string()).describe("Hackathons only: tracks or themes, lowercase, e.g. 'generative ai', 'mobile'. Empty array for a job or if none."),
  seniority: z.string().nullable().describe("Jobs only: e.g. intern, junior, mid, senior, staff. Null if not stated."),
});

export type Extraction = z.infer<typeof extractionSchema>;

export const SYSTEM_PROMPT = `You extract structured data from job postings and hackathon pages.

Rules:
- First decide the kind. A hackathon page talks about submissions, judging,
  prizes, tracks or official rules; a job posting talks about a role, a team
  and applying. Fill only the fields that belong to that kind.
- Only report what the text actually says. Never guess, never fill a field
  from what is typical.
- If something is absent or ambiguous, return null (or "unclear" for remote).
  A null is always better than a plausible invention.
- Compensation is annual. Convert stated monthly or per-lakh figures to an
  annual plain number: "12 LPA" is 1200000, "50k/month" is 600000.
- A hackathon's prizes are never compensation: put them in prizeAmount.
- Rules pages list the sponsor's legal address. That is not the event's
  location.
- Stack means technologies named in the text, not skills like "communication".`;
