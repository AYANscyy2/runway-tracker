/**
 * URL handling for postings, kept free of any server import so it can be
 * tested on its own.
 */

/** Query parameters that identify the visit, not the page. */
const TRACKING_PARAM = /^(utm_\w+|trk|trkinfo|mcid|refid|ref|ref_src|src|source|gh_src|gh_jid_src|lever-source|lever-origin|fbclid|gclid|mc_cid|mc_eid|ecid|si|origin|trackingid)$/i;

/**
 * A board's link for one specific posting, rewritten from the listing it was
 * copied out of. A LinkedIn search URL with `currentJobId` serves the whole
 * search page to a server — with a random "similar job" first — so reading it
 * extracts somebody else's posting. `/jobs/view/<id>` is that one job.
 */
export function postingUrlFor(url: string): string {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return url.trim();
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (host.endsWith("linkedin.com") && u.pathname.startsWith("/jobs/")) {
    const id = u.searchParams.get("currentJobId") ?? /\/jobs\/view\/(?:[^/]*-)?(\d+)/.exec(u.pathname)?.[1];
    if (id && /^\d+$/.test(id)) return `https://www.linkedin.com/jobs/view/${id}/`;
  }
  return u.toString();
}

/** True for a board URL that lists many jobs rather than naming one. */
export function isListingUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    return host.endsWith("linkedin.com") && /^\/jobs\/(search|collections)/.test(u.pathname) && !u.searchParams.get("currentJobId");
  } catch {
    return false;
  }
}

/**
 * The same posting, however it was linked: lowercase host without `www.`, no
 * fragment, no tracking parameters, no trailing slash, sorted query. Used to
 * spot a re-paste before spending a fetch and a model call on it.
 */
export function canonicalUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(postingUrlFor(url));
  } catch {
    return url.trim().toLowerCase();
  }
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAM.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  const path = u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${u.hostname.replace(/^www\./, "").toLowerCase()}${path}${query}`;
}

/** Same kind of thing, same name — "Senior Engineer" at "Acme, Inc." twice. */
export function identityKey(kind: string | null, company: string | null, title: string | null): string | null {
  const norm = (s: string | null) =>
    (s ?? "").toLowerCase().replace(/\b(inc|ltd|llc|pvt|private|limited|corp|co)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const c = norm(company), t = norm(title);
  if (!t) return null; // a company alone is not a posting — it has many
  return `${kind ?? "job"}|${c}|${t}`;
}
