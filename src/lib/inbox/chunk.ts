/**
 * Splits a job description along its own section headings.
 *
 * Fixed token windows are the wrong shape here: job descriptions are highly
 * repetitive across companies, so a window straddling "about us" and
 * "requirements" yields a vector that is close to every other posting and
 * distinguishes none of them. Sections are the natural unit — "what you'll do"
 * and "what we need" are genuinely different questions.
 */

export type Chunk = { section: string; content: string };

/**
 * Site furniture that survives HTML-to-text and then pollutes search: nav
 * bars, cookie notices, footers, and — worst of all — the "similar jobs"
 * rails that boards put beside the posting, which are themselves job text and
 * so match job queries beautifully while being about a different job entirely.
 *
 * This is a heuristic, and it is here because the fetcher strips tags without
 * understanding page structure. A real readability pass would make most of it
 * unnecessary.
 */
const BOILERPLATE = [
  /^skip to (main )?content/i,
  /^(sign in|join now|sign up|log ?in|register)\b/i,
  /^(expand search|search|menu|navigation|close)$/i,
  /^be an early applicant/i,
  /^(apply|save|share|report this job|show more|see more|view all)( job| on .*)?$/i,
  /^\d+ (days?|weeks?|months?|hours?|minutes?) ago$/i,
  /^©\s*\d{4}/,
  /\ball systems normal\b/i,
  /^(cookie|privacy|terms|accessibility|legal)\b.*\b(policy|preferences|notice|statement|of (use|service))\b/i,
  /^(linkedin|indeed|glassdoor|wellfound|y combinator)( corporation| jobs)?$/i,
  /^(my profile|your profile|notifications|messaging|home|jobs|network)$/i,
  /^\d+ (applicants?|views?)$/i,
];

export function isBoilerplate(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return BOILERPLATE.some((p) => p.test(t));
}

/** Headings as they actually appear, mapped to a canonical label so "What
 * you'll do" and "Responsibilities" end up in the same bucket. */
const SECTION_PATTERNS: [RegExp, string][] = [
  [/^(about (the )?(us|company|team|role)|who we are|company overview)\b/i, "about"],
  [/^(responsibilities|what you.?ll (do|be doing)|the role|your role|day to day|duties|job description)\b/i, "responsibilities"],
  [/^(requirements|qualifications|what we.?re looking for|who you are|skills|must have|you have|experience|eligibility)\b/i, "requirements"],
  [/^(nice to have|bonus|preferred|good to have|plus points)\b/i, "preferred"],
  [/^(benefits|perks|what we offer|compensation|salary|stipend|we offer)\b/i, "benefits"],
  [/^(how to apply|application|apply|process|hiring process|interview process|next steps)\b/i, "process"],
];

/** A heading is short, and is either followed by a colon or stands alone. */
function headingOf(line: string): string | null {
  const trimmed = line.trim().replace(/^[#*\-–—•\s]+/, "").replace(/[:：]\s*$/, "").trim();
  if (!trimmed || trimmed.length > 60) return null;
  // A line ending in a full stop is prose, not a heading.
  if (/[.!?]$/.test(trimmed)) return null;
  for (const [pattern, label] of SECTION_PATTERNS) {
    if (pattern.test(trimmed)) return label;
  }
  return null;
}

/** Sections longer than this are split; long enough to keep a requirements
 * list whole, short enough that one vector still means something. */
const MAX_CHUNK_CHARS = 1200;
/** Low on purpose. A requirements section can legitimately be two bullets —
 * "4+ years with Go", "Strong SQL" — and that is the most searchable part of
 * the whole posting. Anything above this is kept; only true fragments go. */
const MIN_CHUNK_CHARS = 16;

function splitLong(section: string, content: string): Chunk[] {
  if (content.length <= MAX_CHUNK_CHARS) return [{ section, content }];

  const out: Chunk[] = [];
  let buffer = "";
  // Break on blank lines and list items, never mid-sentence.
  for (const para of content.split(/\n{2,}|\n(?=[-*•\d]\s)/)) {
    if (buffer && buffer.length + para.length > MAX_CHUNK_CHARS) {
      out.push({ section, content: buffer.trim() });
      buffer = "";
    }
    buffer += (buffer ? "\n" : "") + para.trim();
  }
  if (buffer.trim()) out.push({ section, content: buffer.trim() });
  return out;
}

export function chunkJobDescription(rawText: string): Chunk[] {
  const lines = rawText.split("\n").filter((l) => !isBoilerplate(l));
  const sections: { label: string; lines: string[] }[] = [];
  // Everything before the first recognised heading is the intro — usually the
  // title and company, which is worth keeping.
  let current = { label: "overview", lines: [] as string[] };

  for (const line of lines) {
    const heading = headingOf(line);
    if (heading) {
      if (current.lines.join("\n").trim()) sections.push(current);
      current = { label: heading, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.lines.join("\n").trim()) sections.push(current);

  const chunks = sections
    .flatMap((s) => splitLong(s.label, s.lines.join("\n").trim()))
    .filter((c) => c.content.length >= MIN_CHUNK_CHARS);

  // A posting with no recognisable structure still needs to be searchable.
  if (chunks.length === 0) {
    const whole = rawText.trim();
    return whole.length >= MIN_CHUNK_CHARS ? splitLong("overview", whole) : [];
  }
  return chunks;
}

/** What actually gets embedded. The section label is prefixed so the vector
 * carries which question the text answers, not just the words. */
export function embeddableText(chunk: Chunk): string {
  return `${chunk.section}: ${chunk.content}`;
}
