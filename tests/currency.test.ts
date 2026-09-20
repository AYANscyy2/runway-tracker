import { test } from "node:test";
import assert from "node:assert/strict";
import { convert, isKnownCurrency } from "../src/lib/inbox/currency";

test("converts to and from INR", () => {
  assert.equal(convert(1000, "INR", "INR"), 1000);
  assert.equal(convert(1, "USD", "INR"), 88);
  assert.ok(Math.abs(convert(88, "INR", "USD")! - 1) < 0.5);
});

test("is case and whitespace insensitive", () => {
  assert.equal(convert(1, " usd ", "inr"), 88);
});

test("returns null for a currency with no rate, rather than a wrong number", () => {
  assert.equal(convert(1000, "KRW", "INR"), null);
  assert.equal(convert(1000, "INR", "XYZ"), null);
});

test("isKnownCurrency guards the same set", () => {
  assert.equal(isKnownCurrency("usd"), true);
  assert.equal(isKnownCurrency("KRW"), false);
  assert.equal(isKnownCurrency(null), false);
});

test("each currency has its own annual floor, not one converted threshold", async () => {
  const { minAnnualFor } = await import("../src/lib/inbox/currency");
  // A single INR floor converted to USD would be about $1,100 — far too low to
  // catch a monthly figure passed off as annual.
  assert.ok(minAnnualFor("USD")! > 10_000);
  assert.equal(minAnnualFor("INR"), 100_000);
  assert.equal(minAnnualFor("KRW"), null);
});
