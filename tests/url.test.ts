import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalUrl, identityKey, isListingUrl, postingUrlFor } from "../src/lib/inbox/url";

test("a LinkedIn search link is rewritten to the job it points at", () => {
  assert.equal(
    postingUrlFor("https://www.linkedin.com/jobs/search/?currentJobId=4468455759&mcid=73&trk=li_GP"),
    "https://www.linkedin.com/jobs/view/4468455759/",
  );
  assert.equal(
    postingUrlFor("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=123"),
    "https://www.linkedin.com/jobs/view/123/",
  );
});

test("a LinkedIn search with no job selected is recognised as a listing", () => {
  assert.equal(isListingUrl("https://www.linkedin.com/jobs/search/?keywords=go"), true);
  assert.equal(isListingUrl("https://www.linkedin.com/jobs/view/123/"), false);
  assert.equal(isListingUrl("https://example.com/jobs/search"), false);
});

test("the same page under different tracking links is one URL", () => {
  assert.equal(
    canonicalUrl("https://WWW.Example.com/jobs/42/?utm_source=x&gh_src=y#apply"),
    canonicalUrl("https://example.com/jobs/42"),
  );
});

test("meaningful query parameters survive canonicalisation", () => {
  assert.notEqual(canonicalUrl("https://ex.com/job?id=1"), canonicalUrl("https://ex.com/job?id=2"));
});

test("identity ignores company suffixes and punctuation", () => {
  assert.equal(identityKey("job", "Acme, Inc.", "Backend Engineer"), identityKey("job", "acme", "backend engineer"));
  assert.notEqual(identityKey("job", "Acme", "Backend Engineer"), identityKey("hackathon", "Acme", "Backend Engineer"));
  assert.equal(identityKey("job", "Acme", null), null);
});
