import test from "node:test";
import assert from "node:assert/strict";
import { buildXStatusUrl, collectNewBookmarks, getBookmarkCaptureTimestamp, summarizeBookmarkText } from "../convex/lib/xBookmarks.ts";

test("buildXStatusUrl prefers username path when author is known", () => {
  const url = buildXStatusUrl(
    { id: "123", author_id: "u1" },
    new Map([["u1", { id: "u1", username: "ahmad" }]])
  );

  assert.equal(url, "https://x.com/ahmad/status/123");
});

test("buildXStatusUrl falls back to i/web path without username", () => {
  const url = buildXStatusUrl({ id: "123", author_id: "u1" }, new Map());
  assert.equal(url, "https://x.com/i/web/status/123");
});

test("collectNewBookmarks stops once the last seen tweet is reached", () => {
  const result = collectNewBookmarks(
    [{ id: "5" }, { id: "4" }, { id: "3" }, { id: "2" }],
    "3"
  );

  assert.deepEqual(result, {
    items: [{ id: "5" }, { id: "4" }],
    reachedLastSeen: true
  });
});

test("collectNewBookmarks returns all items when there is no last seen tweet", () => {
  const items = [{ id: "5" }, { id: "4" }];
  const result = collectNewBookmarks(items);

  assert.deepEqual(result, {
    items,
    reachedLastSeen: false
  });
});

test("summarizeBookmarkText normalizes whitespace and truncates long text", () => {
  const summary = summarizeBookmarkText("  one   two   three  ", 8);
  assert.equal(summary, "one two…");
});

test("getBookmarkCaptureTimestamp keeps newer bookmarks ahead within a sync", () => {
  assert.equal(getBookmarkCaptureTimestamp(5_000, 0), 5_000);
  assert.equal(getBookmarkCaptureTimestamp(5_000, 4), 4_996);
});
