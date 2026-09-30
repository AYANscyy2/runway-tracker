import { test } from "node:test";
import assert from "node:assert/strict";
import { fitKeyFor, normalise, scoreCard, scoreMatch, MAX_TOTAL } from "../src/lib/inbox/rubric";
import { DIMENSION_ORDER, WEIGHTS } from "../src/lib/inbox/dimensions";
import type { JobExtraction, MatchBreakdown, UserProfile } from "../src/db/schema";

// The fit dimension is the only part that calls a model. Every test here
// supplies a matching fitKey so the stored answer is reused and nothing
// reaches the network.
const FIT: MatchBreakdown["fit"] = { score: 10, max: 20, reason: "stub" };

const extraction = (over: Partial<JobExtraction> = {}) => ({
  id: 1, postingId: 1, role: "Backend Engineer", company: "Acme",
  stack: ["typescript", "postgresql"], compMin: 1_500_000, compMax: 2_000_000,
  compCurrency: "INR", location: "Bengaluru", remote: "hybrid", deadline: null,
  seniority: "mid", model: "test", promptVersion: "t", attemptCount: 1,
  retriedRule: null, rawResponse: null, inputTokens: null, outputTokens: null,
  createdAt: new Date(), ...over,
}) as JobExtraction;

const profile = (over: Partial<UserProfile> = {}) => ({
  userId: "u1", stack: ["typescript"], targetCompMin: 1_200_000, targetCompMax: 1_800_000,
  compCurrency: "INR", preferredLocations: ["Bengaluru"], remotePreference: "hybrid",
  availableFrom: null, seniority: "mid", notes: "backend",
  createdAt: new Date(), updatedAt: new Date(), ...over,
}) as UserProfile;

const blank = { stack: FIT, comp: FIT, location: FIT, startDate: FIT, fit: FIT } as MatchBreakdown;

/** Score with the fit dimension pre-seeded under its real key, so the cache
 * hits and no model call happens. */
async function score(e: JobExtraction, p: UserProfile) {
  return scoreMatch(e, p, { ...blank, fit: FIT, fitKey: fitKeyFor(e, p) });
}

test("a cached fit is reused verbatim rather than recomputed", async () => {
  const e = extraction(), p = profile();
  const r = await score(e, p);
  assert.equal(r.breakdown.fit.reason, FIT.reason);
  assert.equal(r.breakdown.fitKey, fitKeyFor(e, p));
});

test("the fit key changes when the profile notes change", () => {
  const e = extraction();
  assert.notEqual(fitKeyFor(e, profile()), fitKeyFor(e, profile({ notes: "frontend only" })));
});

test("the fit key ignores fields fit does not depend on", () => {
  // Pay and location are scored arithmetically; changing them must not force
  // a fresh model call.
  assert.equal(
    fitKeyFor(extraction(), profile()),
    fitKeyFor(extraction({ compMin: 99, location: "Mars" }), profile({ targetCompMin: 1 })),
  );
});

test("a matching stack scores near full, a foreign one scores zero", async () => {
  const good = await score(extraction(), profile({ stack: ["typescript", "postgresql"] }));
  assert.equal(good.breakdown.stack.score, good.breakdown.stack.max);

  const bad = await score(extraction({ stack: ["java", "spring"] }), profile());
  assert.equal(bad.breakdown.stack.score, 0);
});

test("pay above target scores full; well below scores zero", async () => {
  const over = await score(extraction({ compMin: 2_000_000, compMax: 2_500_000 }), profile());
  assert.equal(over.breakdown.comp.score, over.breakdown.comp.max);

  const under = await score(extraction({ compMin: 400_000, compMax: 500_000 }), profile());
  assert.equal(under.breakdown.comp.score, 0);
});

test("a USD posting is converted rather than skipped", async () => {
  const r = await score(extraction({ compMin: 120_000, compMax: 140_000, compCurrency: "USD" }), profile());
  assert.equal(r.breakdown.comp.score, r.breakdown.comp.max);
  assert.match(r.breakdown.comp.reason, /converted/);
});

test("a currency with no rate says so instead of comparing", async () => {
  const r = await score(extraction({ compCurrency: "KRW", compMin: 60_000_000, compMax: 70_000_000 }), profile());
  assert.match(r.breakdown.comp.reason, /no conversion rate/);
});

test("remote makes location moot", async () => {
  const r = await score(extraction({ remote: "remote", location: "Reykjavik" }), profile());
  assert.equal(r.breakdown.location.score, r.breakdown.location.max);
});

test("a wanted-remote profile penalises an onsite role", async () => {
  const r = await score(extraction({ remote: "onsite" }), profile({ remotePreference: "remote" }));
  assert.ok(r.breakdown.location.score < r.breakdown.location.max / 2);
});

test("a passed deadline zeroes the timing dimension", async () => {
  const r = await score(extraction({ deadline: "2020-01-01" }), profile());
  assert.equal(r.breakdown.startDate.score, 0);
});

test("stack aliases match: profile 'postgres' vs posting 'postgresql'", async () => {
  const r = await score(extraction({ stack: ["postgresql"] }), profile({ stack: ["postgres"] }));
  assert.equal(r.breakdown.stack.score, r.breakdown.stack.max);
});

test("the total never exceeds the advertised maximum", async () => {
  const r = await score(extraction({ compMin: 9_000_000, compMax: 9_000_000, remote: "remote" }), profile());
  assert.ok(r.total <= MAX_TOTAL, `${r.total} > ${MAX_TOTAL}`);
});

const hackathon = (over: Partial<JobExtraction> = {}) => extraction({
  kind: "hackathon", role: null, seniority: null, compMin: null, compMax: null, compCurrency: null,
  eventName: "Appstore Dev Hackathon", company: "Amazon", remote: "remote", location: null,
  prizeAmount: null, prizeCurrency: null, startsOn: null, endsOn: null, teamSizeMax: null,
  eligibility: null, themes: [], deadline: "2099-01-01",
  stack: ["react native", "kotlin", "java", "aws", "amazon bedrock", "sagemaker"],
  ...over,
});

test("weights for each kind add up to the advertised maximum", () => {
  for (const w of Object.values(WEIGHTS)) {
    assert.equal(Object.values(w).reduce((a, b) => a + b, 0), MAX_TOTAL);
  }
});

test("a hackathon's long tool list doesn't zero the stack score", async () => {
  const two = await score(hackathon(), profile({ stack: ["aws", "java", "typescript"] }));
  assert.equal(two.breakdown.stack.score, two.breakdown.stack.max);

  const one = await score(hackathon(), profile({ stack: ["aws"] }));
  assert.ok(one.breakdown.stack.score > one.breakdown.stack.max / 2);

  const none = await score(hackathon(), profile({ stack: ["typescript"] }));
  assert.ok(none.breakdown.stack.score > 0, "knowing none of the tools is not disqualifying");
  assert.ok(none.breakdown.stack.score < one.breakdown.stack.score);
});

test("a hackathon is scored on prize, format and submission timing", async () => {
  const r = await score(hackathon({ prizeAmount: 20_000, prizeCurrency: "USD" }), profile());
  assert.equal(r.breakdown.comp.score, r.breakdown.comp.max);
  assert.match(r.breakdown.comp.reason, /prizes/);
  assert.match(r.breakdown.location.reason, /Online/);
  assert.match(r.breakdown.startDate.reason, /left to submit/);
  assert.doesNotMatch(r.breakdown.comp.reason, /compensation/);
});

test("a closed hackathon scores zero on timing", async () => {
  const r = await score(hackathon({ deadline: "2020-01-01" }), profile());
  assert.equal(r.breakdown.startDate.score, 0);
});

test("the breakdown has exactly the displayed dimensions and each has a label-able shape", async () => {
  const r = await score(extraction(), profile());
  for (const k of DIMENSION_ORDER) {
    assert.equal(typeof r.breakdown[k].score, "number");
    assert.equal(typeof r.breakdown[k].max, "number");
  }
  assert.equal(DIMENSION_ORDER.reduce((s, k) => s + r.breakdown[k].score, 0), r.total);
});

test("a card with no stored fit still gets a score, marked pending", () => {
  const c = scoreCard(extraction(), profile(), null);
  assert.equal(c.fitPending, true);
  assert.equal(c.breakdown.fit.score, c.breakdown.fit.max / 2);
  assert.ok(c.total > 0);
});

test("a stored fit from an older profile is pending, not silently reused", () => {
  const e = extraction(), p = profile();
  const c = scoreCard(e, profile({ notes: "something else" }), { ...blank, fitKey: fitKeyFor(e, p) });
  assert.equal(c.fitPending, true);
  assert.match(c.breakdown.fit.reason, /profile changed/);
});

test("the timing dimension is computed on read, so a stored score can't go stale", () => {
  const e = extraction({ deadline: "2020-01-01" }), p = profile();
  const stored = { ...blank, startDate: { score: 5, max: 5, reason: "Open" }, fitKey: fitKeyFor(e, p) };
  assert.equal(scoreCard(e, p, stored).breakdown.startDate.score, 0);
});

test("jobs keep their existing fit key, so stored fits survive the upgrade", () => {
  // Pinned: changing this invalidates every stored fit and costs a model call each.
  const e = extraction(), p = profile();
  assert.equal(fitKeyFor(e, p), fitKeyFor({ ...e, kind: "job", eventName: "ignored", themes: ["x"] } as JobExtraction, p));
});

test("technology names normalise across spellings", () => {
  assert.equal(normalise("React.js"), normalise("react"));
  assert.equal(normalise("NodeJS"), normalise("node.js"));
  assert.equal(normalise("GCP"), normalise("Google Cloud Platform"));
  assert.equal(normalise("Tailwind CSS"), normalise("tailwindcss"));
  assert.equal(normalise("js"), "javascript");
});

test("a stack reason says how many it left out", async () => {
  const r = await score(extraction({ stack: ["a", "b", "c", "d", "e", "f"] }), profile());
  assert.match(r.breakdown.stack.reason, /and 2 more/);
});
