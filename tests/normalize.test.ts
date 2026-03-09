import test from "node:test";
import assert from "node:assert/strict";
import { captureBucket, detectPlatform, extractPlatformIds, normalizeUrl } from "../convex/lib/normalize.ts";

test("normalizeUrl removes tracking params and hash", () => {
  const normalized = normalizeUrl(
    "https://x.com/user/status/12345?utm_source=foo&utm_medium=bar&keep=yes#section"
  );
  assert.equal(normalized, "https://x.com/user/status/12345?keep=yes");
});

test("detectPlatform and IDs for X", () => {
  const url = "https://x.com/jack/status/20";
  assert.equal(detectPlatform(url), "x");
  assert.deepEqual(extractPlatformIds(url, "x"), { tweet_id: "20" });
});

test("detectPlatform and IDs for YouTube", () => {
  const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  assert.equal(detectPlatform(url), "youtube");
  assert.deepEqual(extractPlatformIds(url, "youtube"), { video_id: "dQw4w9WgXcQ" });
});

test("captureBucket is deterministic", () => {
  const value = captureBucket(1_700_000_000_000, 600_000);
  assert.equal(value, Math.floor(1_700_000_000_000 / 600_000));
});
