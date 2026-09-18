import { STATUS_FOR_TYPE, type OppType, type Status } from "./constants";
import type { OpportunityInput } from "@/app/actions";

const TYPES: OppType[] = ["job", "hackathon"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 2000;

function fail(msg: string): never {
  throw new Error(msg);
}

function optText(v: unknown, field: string): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") fail(`${field} must be text.`);
  const t = v.trim();
  if (t.length > MAX_TEXT) fail(`${field} is too long.`);
  return t || null;
}

function optDate(v: unknown, field: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !ISO_DATE.test(v) || Number.isNaN(Date.parse(v))) fail(`${field} must be a YYYY-MM-DD date.`);
  return v;
}

function urls(v: unknown): { label: string; url: string }[] {
  if (!Array.isArray(v)) fail("urls must be a list.");
  return v.map((u, i) => {
    const url = typeof u?.url === "string" ? u.url.trim() : "";
    const label = typeof u?.label === "string" ? u.label.trim() : "";
    if (!url) fail(`Link ${i + 1} is missing a URL.`);
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw 0;
    } catch {
      fail(`Link ${i + 1} isn't a valid http(s) URL.`);
    }
    return { label: label || url, url };
  });
}

/**
 * Server actions can't trust the client payload — it's just a POST body. This
 * narrows it to the shape the DB expects and rejects impossible combinations
 * (e.g. a job in "hackathon_active"). Partial inputs (edits) only validate the
 * keys that are present; `type`/`status` cross-check uses `currentType` when
 * the edit doesn't change the type.
 */
export function validateOpportunityInput(
  raw: Partial<OpportunityInput>,
  opts: { partial: boolean; currentType?: OppType },
): Partial<OpportunityInput> {
  const out: Partial<OpportunityInput> = {};
  const has = (k: keyof OpportunityInput) => opts.partial ? raw[k] !== undefined : true;

  if (has("type")) {
    if (!TYPES.includes(raw.type as OppType)) fail("Invalid type.");
    out.type = raw.type;
  }
  if (has("name")) {
    const name = optText(raw.name, "Name");
    if (!name) fail("Name is required.");
    out.name = name;
  }
  if (has("source")) out.source = optText(raw.source, "Source");
  if (has("deadline")) out.deadline = optDate(raw.deadline, "Deadline");

  if (has("status")) {
    const type = out.type ?? opts.currentType;
    const allowed: Status[] = type ? STATUS_FOR_TYPE[type] : [];
    if (!allowed.includes(raw.status as Status)) fail(`"${raw.status}" isn't a valid status for a ${type ?? "record"}.`);
    out.status = raw.status as Status;
  }
  if (has("referralContact")) out.referralContact = optText(raw.referralContact, "Referral contact");
  if (has("foundDate")) out.foundDate = optDate(raw.foundDate, "Found date");
  if (has("followUpDate")) out.followUpDate = optDate(raw.followUpDate, "Follow-up date");
  if (has("nextAction")) out.nextAction = optText(raw.nextAction, "Next action");
  if (has("notes")) out.notes = optText(raw.notes, "Notes");
  if (has("urls")) out.urls = urls(raw.urls);

  return out;
}
