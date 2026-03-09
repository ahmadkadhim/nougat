import test from "node:test";
import assert from "node:assert/strict";
import { createCaptureHash, sha256Hex } from "../convex/lib/hash.ts";

test("sha256Hex is deterministic", async () => {
  const a = await sha256Hex("hello");
  const b = await sha256Hex("hello");
  assert.equal(a, b);
});

test("createCaptureHash changes with selected text", async () => {
  const base = await createCaptureHash({ canonicalUrl: "https://example.com" });
  const changed = await createCaptureHash({ canonicalUrl: "https://example.com", selectedText: "note" });
  assert.notEqual(base, changed);
});
