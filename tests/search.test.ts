import { test } from "node:test";
import assert from "node:assert/strict";
import { fuse, RRF_K } from "../src/lib/inbox/rrf";

test("a posting both engines rank highly beats one only a single engine loves", () => {
  const fused = fuse([
    { engine: "keyword",  results: [{ postingId: 1 }, { postingId: 2 }] },   // 2 is second here
    { engine: "semantic", results: [{ postingId: 3 }, { postingId: 2 }] },   // and second here
  ]);
  // 1 and 3 are each rank-1 in one list; 2 is rank-2 in both. Agreement wins.
  assert.equal(fused[0].postingId, 2);
  assert.deepEqual(fused[0].matchedBy.sort(), ["keyword", "semantic"]);
});

test("scores are the sum of reciprocal ranks", () => {
  const fused = fuse([{ engine: "keyword", results: [{ postingId: 7 }] }]);
  assert.equal(fused[0].score, 1 / (RRF_K + 1));
});

test("one engine returning nothing degrades gracefully", () => {
  const fused = fuse([
    { engine: "keyword", results: [] },
    { engine: "semantic", results: [{ postingId: 9 }, { postingId: 8 }] },
  ]);
  assert.deepEqual(fused.map((f) => f.postingId), [9, 8]);
  assert.deepEqual(fused[0].matchedBy, ["semantic"]);
});

test("results come back in descending score order", () => {
  const fused = fuse([{ engine: "keyword", results: [1, 2, 3, 4].map((postingId) => ({ postingId })) }]);
  const scores = fused.map((f) => f.score);
  assert.deepEqual([...scores].sort((a, b) => b - a), scores);
});

test("nothing found is an empty list, not a throw", () => {
  assert.deepEqual(fuse([]), []);
});
