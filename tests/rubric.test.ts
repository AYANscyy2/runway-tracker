import { test } from "node:test";
import assert from "node:assert/strict";
import { fitKeyFor, scoreMatch, MAX_TOTAL } from "../src/lib/inbox/rubric";
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
