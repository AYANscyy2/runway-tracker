import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkJobDescription, embeddableText } from "../src/lib/inbox/chunk";

const JD = `Senior Backend Engineer at Acme
Bengaluru, hybrid.

About the company
Acme builds payments infrastructure for Indian businesses.

Responsibilities
- Design and ship REST APIs in Go
- Own a service end to end

Requirements
- 4+ years with Go or Java
- Strong SQL

Benefits
- Health insurance
- Annual learning budget

How to apply
Send a CV to jobs@acme.example.`;

test("splits along the posting's own headings", () => {
  const sections = chunkJobDescription(JD).map((c) => c.section);
  assert.deepEqual(
    [...new Set(sections)],
    ["overview", "about", "responsibilities", "requirements", "benefits", "process"],
  );
});

test("keeps the title block, which has the role and company", () => {
  const overview = chunkJobDescription(JD).find((c) => c.section === "overview");
  assert.match(overview!.content, /Senior Backend Engineer at Acme/);
});

test("maps synonymous headings to one label", () => {
  const a = chunkJobDescription("What you'll do\nBuild things all day long, mostly in Go and Postgres.");
  const b = chunkJobDescription("Responsibilities\nBuild things all day long, mostly in Go and Postgres.");
  assert.equal(a[0].section, "responsibilities");
  assert.equal(b[0].section, a[0].section);
});

test("does not mistake a sentence for a heading", () => {
  // Starts with "Experience" but is prose, so it must not open a section.
  const chunks = chunkJobDescription("Experience with Go is required for this role, ideally four years of it.");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].section, "overview");
});

test("an unstructured posting is still chunked, not dropped", () => {
  const text = "We need someone to help with our backend. ".repeat(4);
  const chunks = chunkJobDescription(text);
  assert.ok(chunks.length >= 1);
  assert.equal(chunks[0].section, "overview");
});

test("drops fragments too short to carry meaning", () => {
  assert.deepEqual(chunkJobDescription("Hi"), []);
});

test("splits a very long section instead of embedding it whole", () => {
  const long = "Requirements\n" + Array.from({ length: 80 }, (_, i) => `- Requirement number ${i} about a specific technology`).join("\n\n");
  const chunks = chunkJobDescription(long);
  assert.ok(chunks.length > 1, "expected the section to be split");
  assert.ok(chunks.every((c) => c.section === "requirements"));
  assert.ok(chunks.every((c) => c.content.length <= 1500));
});

test("the embedded text carries the section label", () => {
  assert.equal(embeddableText({ section: "requirements", content: "Strong SQL" }), "requirements: Strong SQL");
});

test("drops page furniture that survives HTML stripping", () => {
  const withChrome = `Skip to main content
LinkedIn
Sign in
Senior Backend Engineer at Acme, a payments company in Bengaluru.
Be an early applicant
2 days ago
© 2026 LinkedIn Corporation`;
  const content = chunkJobDescription(withChrome).map((c) => c.content).join("\n");
  assert.match(content, /Senior Backend Engineer at Acme/);
  for (const noise of ["Skip to main content", "Sign in", "Be an early applicant", "2 days ago", "© 2026"]) {
    assert.doesNotMatch(content, new RegExp(noise.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `kept: ${noise}`);
  }
});

test("does not mistake real posting text for boilerplate", () => {
  const text = "Requirements\nYou will search logs and save time for the team, and apply rigorous thinking.";
  const content = chunkJobDescription(text).map((c) => c.content).join("\n");
  assert.match(content, /search logs and save time/);
});
