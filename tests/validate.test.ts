import { test } from "node:test";
import assert from "node:assert/strict";
import { checkExtraction, isExpired, normalizeExtraction } from "../src/lib/inbox/validate";
import type { Extraction } from "../src/lib/inbox/schema";

const base: Extraction = {
  kind: "job", role: "Backend Engineer", company: "Acme", eventName: null, stack: [],
  compMin: null, compMax: null, compCurrency: null, prizeAmount: null, prizeCurrency: null,
  location: null, remote: "unclear", deadline: null, startsOn: null, endsOn: null,
  teamSizeMax: null, eligibility: null, themes: [], seniority: null,
};
const rule = (e: Partial<Extraction>, text = "text") => checkExtraction({ ...base, ...e }, text)?.rule ?? null;

test("accepts a well-formed extraction", () => {
  assert.equal(rule({ compMin: 1_200_000, compMax: 1_800_000, compCurrency: "INR" }), null);
});

test("catches a monthly INR figure left unconverted", () => {
  assert.equal(rule({ compMin: 50_000, compMax: 50_000, compCurrency: "INR" }), "comp_out_of_range");
});

test("catches an unconverted figure in a foreign currency too", () => {
  // $900/yr is not a salary; it is a monthly or weekly number.
  assert.equal(rule({ compMin: 900, compMax: 900, compCurrency: "USD" }), "comp_out_of_range");
});

test("accepts a real USD salary", () => {
  assert.equal(rule({ compMin: 120_000, compMax: 140_000, compCurrency: "USD" }), null);
});

test("catches an inverted band", () => {
  assert.equal(rule({ compMin: 900_000, compMax: 500_000, compCurrency: "INR" }), "comp_inverted");
});

test("catches a figure with no currency", () => {
  assert.equal(rule({ compMin: 1_200_000 }), "comp_without_currency");
});

test("rejects 'remote' the posting never claims", () => {
  assert.equal(rule({ remote: "remote" }, "Work from our Pune office."), "remote_unsupported");
});

test("accepts 'remote' the posting does claim", () => {
  assert.equal(rule({ remote: "remote" }, "This is a fully remote role."), null);
});

test("rejects 'onsite' contradicted by the text", () => {
  assert.equal(rule({ remote: "onsite" }, "Remote-first, work from anywhere."), "onsite_contradicted");
});

test("catches an impossible date", () => {
  assert.equal(rule({ deadline: "2026-13-45" }), "deadline_unparseable");
});

test("an unknown currency skips the range check rather than guessing", () => {
  assert.equal(rule({ compMin: 500_000, compMax: 700_000, compCurrency: "KRW" }), null);
});

test("isExpired compares calendar dates", () => {
  assert.equal(isExpired("2020-01-01"), true);
  assert.equal(isExpired("2099-01-01"), false);
  assert.equal(isExpired(null), false);
});

test("catches a monthly USD figure, which an INR-derived floor would miss", () => {
  // $8k/yr is not a US salary; before per-currency floors this passed.
  assert.equal(rule({ compMin: 8_000, compMax: 9_000, compCurrency: "USD" }), "comp_out_of_range");
});

test("still allows a genuinely low Indian stipend", () => {
  assert.equal(rule({ compMin: 120_000, compMax: 150_000, compCurrency: "INR" }), null);
});

test("a currency with no floor is left alone rather than guessed at", () => {
  assert.equal(rule({ compMin: 1, compMax: 2, compCurrency: "KRW" }), null);
});

test("a 'job' read off a hackathon site is sent back", () => {
  const e = { ...base, role: null };
  assert.equal(checkExtraction(e, "text", "https://amazonappdev2026.devpost.com/rules")?.rule, "kind_mismatch");
});

test("a 'job' whose text is plainly a hackathon is sent back", () => {
  const text = "Join the hackathon! Hackathon rules. Hackathon prizes and judging criteria below.";
  assert.equal(rule({ role: null }, text), "kind_mismatch");
});

test("a job ad that mentions hackathons in passing is left alone", () => {
  assert.equal(rule({}, "We run an internal hackathon every quarter."), null);
});

test("a hackathon's prize reported as pay is moved to the prize", () => {
  const n = normalizeExtraction({ ...base, kind: "hackathon", role: "x", compMin: 50_000, compMax: 50_000, compCurrency: "usd" });
  assert.equal(n.compMin, null);
  assert.equal(n.role, null);
  assert.equal(n.prizeAmount, 50_000);
  assert.equal(n.prizeCurrency, "USD");
});

test("a job never keeps hackathon-only fields", () => {
  const n = normalizeExtraction({ ...base, eventName: "Stray", prizeAmount: 10, themes: ["ai"] });
  assert.equal(n.eventName, null);
  assert.equal(n.prizeAmount, null);
  assert.deepEqual(n.themes, []);
});

test("'online' supports remote for a hackathon", () => {
  assert.equal(rule({ kind: "hackathon", role: null, remote: "remote" }, "This is an online event."), null);
});

test("a rolled-over date like Feb 31 is caught", () => {
  assert.equal(rule({ deadline: "2026-02-31" }), "deadline_unparseable");
  assert.equal(rule({ kind: "hackathon", role: null, endsOn: "2026-04-31" }), "deadline_unparseable");
});

test("an online hackathon drops the sponsor address it picked up as a location", () => {
  const n = normalizeExtraction({ ...base, kind: "hackathon", remote: "remote", location: "Seattle, Washington" });
  assert.equal(n.location, null);
});
