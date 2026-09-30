import { test } from "node:test";
import assert from "node:assert/strict";
import { deadlineMatters } from "../src/lib/constants";
import { validateOpportunityInput } from "../src/lib/validate";
import { parseQuick, parseStatus, parseType } from "../src/lib/view-params";

test("unknown URL filters fall back instead of crashing", () => {
  assert.equal(parseType("jobs"), "all");
  assert.equal(parseType("hackathon"), "hackathon");
  assert.equal(parseStatus("garbage", "all"), "all");
  assert.equal(parseQuick("whatever"), "");
  assert.equal(parseQuick("stale"), "stale");
});

test("a status that doesn't exist for the type is dropped", () => {
  assert.equal(parseStatus("oa_assignment", "hackathon"), "all");
  assert.equal(parseStatus("hackathon_active", "hackathon"), "hackathon_active");
});

test("a job's deadline stops mattering once applied", () => {
  assert.equal(deadlineMatters("job", "found"), true);
  assert.equal(deadlineMatters("job", "applied"), false);
});

test("a hackathon's submission deadline stops mattering once you're in it", () => {
  assert.equal(deadlineMatters("hackathon", "found"), true);
  assert.equal(deadlineMatters("hackathon", "applied"), true);
  assert.equal(deadlineMatters("hackathon", "hackathon_active"), false);
  assert.equal(deadlineMatters("hackathon", "selected"), false);
});

test("the server rejects a rolled-over date like Feb 31", () => {
  assert.throws(() => validateOpportunityInput({ deadline: "2026-02-31" }, { partial: true }), /real/);
  assert.deepEqual(validateOpportunityInput({ deadline: "2026-02-28" }, { partial: true }), { deadline: "2026-02-28" });
});

test("a status invalid for the type is rejected", () => {
  assert.throws(() => validateOpportunityInput({ status: "oa_assignment" }, { partial: true, currentType: "hackathon" }));
});
