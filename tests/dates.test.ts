import { test } from "node:test";
import assert from "node:assert/strict";
import { countdownLabel, daysUntil, todayIso, urgencyFor } from "../src/lib/dates";

test("todayIso is the local calendar date, not UTC", () => {
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  assert.equal(todayIso(), expected);
});

test("daysUntil ignores time of day", () => {
  assert.equal(daysUntil(todayIso()), 0);
  assert.equal(daysUntil(null), null);
});

test("countdownLabel reads naturally on both sides of today", () => {
  assert.equal(countdownLabel(todayIso()), "today");
  assert.match(countdownLabel("2099-01-01"), /^in \d+d$/);
  assert.match(countdownLabel("2000-01-01"), /overdue$/);
});

test("urgencyFor escalates as the deadline nears", () => {
  assert.equal(urgencyFor("2000-01-01", false), "overdue");
  assert.equal(urgencyFor(todayIso(), false), "urgent");
  assert.equal(urgencyFor("2099-01-01", false), "ok");
  assert.equal(urgencyFor("2099-01-01", true), "none");
  assert.equal(urgencyFor(null, false), "none");
});
