import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdownDocument } from "../convex/lib/markdown.ts";

test("markdown contains required frontmatter keys", () => {
  const markdown = renderMarkdownDocument({
    sourceUrl: "https://example.com/post",
    title: "Example",
    summary: "Summary",
    body: "Body",
    frontmatter: {
      id: "cap_1",
      source_url: "https://example.com/post",
      canonical_url: "https://example.com/post",
      author: "Author",
      platform: "web",
      platform_ids: {},
      captured_at: 1700000000000,
      device_id: "dev_1",
      capture_method: "single_tab",
      extraction_status: "enriched",
      confidence: 0.95,
      dedupe_keys: {
        capture_hash: "abc",
        captured_bucket: 1
      }
    }
  });

  assert.match(markdown, /^---/);
  assert.match(markdown, /source_url:/);
  assert.match(markdown, /canonical_url:/);
  assert.match(markdown, /platform:/);
  assert.match(markdown, /# Example/);
  assert.match(markdown, /## Summary/);
});
