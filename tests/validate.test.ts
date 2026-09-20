import { test } from "node:test";
import assert from "node:assert/strict";
import { checkExtraction, isExpired } from "../src/lib/inbox/validate";
import type { Extraction } from "../src/lib/inbox/schema";

const base: Extraction = {
  role: "Backend Engineer", company: "Acme", stack: [],
  compMin: null, compMax: null, compCurrency: null,
  location: null, remote: "unclear", deadline: null, seniority: null,
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
