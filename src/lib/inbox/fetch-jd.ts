/**
 * Best-effort text extraction from a job posting URL.
 *
 * Plenty of boards (LinkedIn, Workday, Greenhouse behind a login) either block
 * server-side fetches outright or render the description with JavaScript. When
 * that happens we say so and ask for a paste — we never hand the model an
 * error page and present whatever it hallucinates as an extraction.
 */

import { isListingUrl, postingUrlFor } from "./url";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

/** Roughly how much readable text a real JD has. Below this we assume a wall. */
const MIN_USABLE_CHARS = 400;

export class FetchBlockedError extends Error {
  constructor(site: string, detail: string) {
    super(`Couldn't read ${site} — ${detail}. Copy the job description text and paste it instead.`);
    this.name = "FetchBlockedError";
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Strip a document down to its visible text without pulling in a DOM library. */
export function htmlToText(html: string): string {
  const body = html
    .replace(/<(script|style|noscript|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Keep block boundaries as newlines so section headings survive chunking.
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(body)
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…",
  };
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

export async function fetchJobDescription(input: string): Promise<{ text: string; title: string | null; url: string }> {
  const url = postingUrlFor(input);
  const site = hostOf(url);
  if (isListingUrl(url)) {
    throw new FetchBlockedError(site, "that link is a search page with many jobs, not one posting. Open the job itself and copy its link");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new FetchBlockedError(site, e instanceof Error && e.name === "TimeoutError" ? "it timed out" : "the request failed");
  }

  if (!res.ok) {
    const why = res.status === 403 || res.status === 401
      ? "it blocks automated requests"
      : res.status === 404
        ? "the page is gone"
        : `it returned HTTP ${res.status}`;
    throw new FetchBlockedError(site, why);
  }

  const html = await res.text();
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const text = htmlToText(html);

  if (text.length < MIN_USABLE_CHARS) {
    throw new FetchBlockedError(site, "the page had no readable description (it probably renders with JavaScript)");
  }

  return { text, title: title ? decodeEntities(title).replace(/\s+/g, " ").trim() : null, url };
}
