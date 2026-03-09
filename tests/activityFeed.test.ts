import test from "node:test";
import assert from "node:assert/strict";
import {
  buildActivityPreview,
  compareActivityCaptures,
  getActivityAuthor,
  getActivityPostedAt,
  getActivitySourcedAt,
  getActivitySyncBatchAt
} from "../convex/lib/activity.ts";

test("compareActivityCaptures sorts newest sourced items first", () => {
  const captures = [
    {
      canonicalUrl: "https://example.com/older",
      captureMethod: "manual",
      capturedAt: 100,
      createdAt: 100,
      platform: "web",
      sourceMetadata: undefined
    },
    {
      canonicalUrl: "https://example.com/newer",
      captureMethod: "manual",
      capturedAt: 300,
      createdAt: 200,
      platform: "web",
      sourceMetadata: undefined
    }
  ];

  const sorted = [...captures].sort(compareActivityCaptures);
  assert.equal(sorted[0]?.capturedAt, 300);
});

test("compareActivityCaptures keeps X bookmark items in bookmark order within one sync", () => {
  const captures = [
    {
      canonicalUrl: "https://x.com/test/status/5",
      captureMethod: "x_bookmark_sync",
      capturedAt: 500,
      createdAt: 120,
      platform: "x",
      sourceMetadata: { synced_at: 500 }
    },
    {
      canonicalUrl: "https://x.com/test/status/4",
      captureMethod: "x_bookmark_sync",
      capturedAt: 500,
      createdAt: 150,
      platform: "x",
      sourceMetadata: { synced_at: 500 }
    }
  ];

  const sorted = [...captures].sort(compareActivityCaptures);
  assert.equal(sorted[0]?.createdAt, 120);
});

test("activity helpers fall back to X raw payload metadata", () => {
  const capture = {
    canonicalUrl: "https://x.com/ahmad/status/123",
    captureMethod: "x_bookmark_sync",
    capturedAt: 1_000,
    createdAt: 1_010,
    platform: "x",
    rawPayload: {
      x_bookmark: {
        created_at: "2026-03-07T09:10:00.000Z"
      },
      x_user: {
        name: "Ahmad"
      }
    }
  };

  assert.equal(getActivityAuthor(capture), "Ahmad");
  assert.equal(getActivityPostedAt(capture), Date.parse("2026-03-07T09:10:00.000Z"));
  assert.equal(getActivitySourcedAt(capture), 1_000);
});

test("buildActivityPreview creates an X-style preview model", () => {
  const preview = buildActivityPreview({
    author: "Ahmad",
    canonicalUrl: "https://x.com/ahmad/status/123",
    captureMethod: "x_bookmark_sync",
    capturedAt: 1_000,
    createdAt: 1_010,
    platform: "x",
    rawPayload: {
      author_profile: {
        avatar_url: "https://pbs.twimg.com/profile_images/test.jpg",
        display_name: "Ahmad",
        username: "ahmad",
        verified: true
      },
      link_preview: {
        type: "external",
        url: "https://github.com/acme/repo",
        title: "acme/repo",
        summary: "Repo summary",
        domain: "github.com"
      },
      x: {
        data: {
          text: "Hello https://t.co/example",
          entities: {
            urls: [
              {
                url: "https://t.co/example",
                expanded_url: "https://github.com/acme/repo"
              }
            ]
          }
        }
      }
    },
    sourceMetadata: undefined,
    titleHint: "Fallback title"
  });

  assert.equal(preview.title, "acme/repo");
  assert.equal(preview.xPost?.author, "Ahmad");
  assert.equal(preview.xPost?.username, "ahmad");
  assert.equal(preview.xPost?.verified, true);
  assert.equal(preview.xPost?.text, "Hello github.com/acme/repo");
  assert.equal(preview.xPost?.linkPreview?.domain, "github.com");
  assert.deepEqual(preview.xPost?.mediaPreviewUrls, []);
});

test("getActivitySyncBatchAt returns bookmark sync batch timestamps", () => {
  assert.equal(
    getActivitySyncBatchAt({
      canonicalUrl: "https://x.com/ahmad/status/123",
      captureMethod: "x_bookmark_sync",
      capturedAt: 1_000,
      createdAt: 1_010,
      platform: "x",
      sourceMetadata: {
        synced_at: "2026-03-07T09:10:00.000Z"
      }
    }),
    Date.parse("2026-03-07T09:10:00.000Z")
  );
});
