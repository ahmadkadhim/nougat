import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  buildXStatusUrl,
  collectNewBookmarks,
  getBookmarkCaptureTimestamp,
  summarizeBookmarkText,
  type XBookmarkTweet,
  type XBookmarkUser
} from "./lib/xBookmarks";
import { normalizeUrl } from "./lib/normalize";

const SYNC_SOURCE_KEY = "default";
const SYSTEM_DEVICE_ID = "system_x_bookmarks";
const MAX_PAGES = 8;
const PAGE_SIZE = 100;
const internalApi = internal as any;

type BookmarkPage = {
  data?: XBookmarkTweet[];
  includes?: {
    users?: XBookmarkUser[];
    media?: Array<{
      alt_text?: string;
      media_key?: string;
      preview_image_url?: string;
      type?: string;
      url?: string;
      public_metrics?: Record<string, unknown>;
      variants?: unknown[];
      width?: number;
      height?: number;
      duration_ms?: number;
    }>;
    tweets?: Array<Record<string, unknown>>;
    polls?: Array<Record<string, unknown>>;
    places?: Array<Record<string, unknown>>;
  };
  meta?: {
    next_token?: string;
    result_count?: number;
  };
};

export const runScheduledSync = internalAction({
  args: {},
  handler: async (ctx) => {
    const ownerAuthUserIds = await ctx.runQuery(internalApi.xAuth.listCredentialOwners, {});
    const uniqueOwnerIds = [...new Set(ownerAuthUserIds)];

    const results = [];
    for (const ownerAuthUserId of uniqueOwnerIds) {
      const result = await ctx.runAction(internalApi.xBookmarks.runScheduledSyncForUser, {
        ownerAuthUserId
      });
      results.push(result);
    }

    return {
      ok: true,
      users: results
    };
  }
});

export const runScheduledSyncForUser = internalAction({
  args: {
    ownerAuthUserId: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const state = await ctx.runQuery(internalApi.xBookmarks.getSyncState, {
      ownerAuthUserId: args.ownerAuthUserId,
      sourceKey: SYNC_SOURCE_KEY
    });

    try {
      const auth = await ctx.runAction(internalApi.xAuth.getBookmarkAccess, {
        ownerAuthUserId: args.ownerAuthUserId
      });
      const accessToken = auth.accessToken;
      if (!accessToken) {
        return {
          ok: true,
          skipped: true,
          reason: "No X bookmark access token is available"
        };
      }

      const userId = process.env.X_BOOKMARKS_USER_ID ?? auth.userId ?? (await resolveUserId(accessToken));
      let nextToken: string | undefined;
      let newestSeenTweetId = state?.lastSeenTweetId;
      let scanned = 0;
      let imported = 0;
      let duplicates = 0;
      let pageCount = 0;
      let bookmarkOffset = 0;
      let reachedLastSeen = false;

      while (pageCount < MAX_PAGES && !reachedLastSeen) {
        const page = await fetchBookmarksPage({
          accessToken,
          userId,
          paginationToken: nextToken
        });

        const usersById = new Map((page.includes?.users ?? []).map((user) => [user.id, user]));
        const tweets = page.data ?? [];
        if (!newestSeenTweetId && tweets[0]?.id) {
          newestSeenTweetId = tweets[0].id;
        }

        const nextBatch = collectNewBookmarks(tweets, state?.lastSeenTweetId);
        reachedLastSeen = nextBatch.reachedLastSeen;

        for (const tweet of nextBatch.items) {
          const capturedAt = getBookmarkCaptureTimestamp(now, bookmarkOffset);
          bookmarkOffset += 1;
          scanned += 1;
          const sourceUrl = normalizeUrl(buildXStatusUrl(tweet, usersById));
          const bookmarkContextResponse = buildBookmarkContextResponse(page, tweet);
          const bookmarkRequest = {
            endpoint: `/2/users/${userId}/bookmarks`,
            max_results: PAGE_SIZE,
            pagination_token: nextToken ?? null,
            expansions: [
              "article.cover_media",
              "article.media_entities",
              "attachments.media_keys",
              "attachments.media_source_tweet",
              "attachments.poll_ids",
              "author_id",
              "edit_history_tweet_ids",
              "entities.mentions.username",
              "geo.place_id",
              "in_reply_to_user_id",
              "entities.note.mentions.username",
              "referenced_tweets.id",
              "referenced_tweets.id.attachments.media_keys",
              "referenced_tweets.id.author_id"
            ],
            tweet_fields: [
              "article",
              "attachments",
              "author_id",
              "card_uri",
              "community_id",
              "context_annotations",
              "conversation_id",
              "created_at",
              "display_text_range",
              "edit_controls",
              "edit_history_tweet_ids",
              "entities",
              "geo",
              "id",
              "in_reply_to_user_id",
              "lang",
              "media_metadata",
              "note_tweet",
              "possibly_sensitive",
              "public_metrics",
              "reply_settings",
              "referenced_tweets",
              "scopes",
              "source",
              "suggested_source_links",
              "suggested_source_links_with_counts",
              "text"
            ],
            user_fields: [
              "created_at",
              "description",
              "entities",
              "id",
              "location",
              "most_recent_tweet_id",
              "name",
              "pinned_tweet_id",
              "profile_banner_url",
              "profile_image_url",
              "protected",
              "public_metrics",
              "url",
              "username",
              "verified",
              "verified_followers_count",
              "verified_type",
              "withheld"
            ],
            media_fields: [
              "alt_text",
              "duration_ms",
              "height",
              "media_key",
              "preview_image_url",
              "public_metrics",
              "type",
              "url",
              "variants",
              "width"
            ],
            poll_fields: ["duration_minutes", "end_datetime", "id", "options", "voting_status"],
            place_fields: ["contained_within", "country", "country_code", "full_name", "geo", "id", "name", "place_type"]
          };
          const existingCapture = await ctx.runQuery(internal.captures.findCaptureByCanonicalUrl, {
            canonicalUrl: sourceUrl,
            ownerAuthUserId: args.ownerAuthUserId
          });

          if (existingCapture) {
            duplicates += 1;
            continue;
          }

          const result = await ctx.runMutation(internal.captures.ingestSystemCapture, {
            deviceId: SYSTEM_DEVICE_ID,
            ownerAuthUserId: args.ownerAuthUserId,
            request: {
              source_url: sourceUrl,
              captured_at: capturedAt,
              capture_method: "x_bookmark_sync",
              source_app: "x",
              title_hint: summarizeBookmarkText(tweet.text),
              platform_hint: "x",
              author_hint: tweet.author_id
                ? usersById.get(tweet.author_id)?.name ?? usersById.get(tweet.author_id)?.username
                : undefined,
              source_metadata: {
                sync_source: "x_bookmarks",
                synced_at: now,
                tweet_id: tweet.id,
                author_id: tweet.author_id ?? null,
                posted_at: tweet.created_at ?? null
              }
            },
            rawPayload: {
              x_bookmark: tweet,
              x_user: tweet.author_id ? usersById.get(tweet.author_id) ?? null : null,
              x_media: bookmarkContextResponse.includes.media,
              x_bookmark_context: {
                fetched_at: now,
                request: bookmarkRequest,
                response: bookmarkContextResponse
              },
              sync_source: "x_bookmarks",
              synced_at: now
            }
          });

          if (result.deduped) {
            duplicates += 1;
          } else {
            imported += 1;
          }
        }

        pageCount += 1;
        nextToken = page.meta?.next_token;
        if (!nextToken || tweets.length === 0) {
          break;
        }
      }

      await ctx.runMutation(internalApi.xBookmarks.recordSyncRun, {
        ownerAuthUserId: args.ownerAuthUserId,
        sourceKey: SYNC_SOURCE_KEY,
        lastSeenTweetId: newestSeenTweetId,
        lastRunAt: now,
        lastSuccessAt: now,
        importedCount: imported,
        duplicateCount: duplicates
      });

      return {
        ok: true,
        skipped: false,
        owner_auth_user_id: args.ownerAuthUserId,
        scanned,
        imported,
        duplicates,
        newest_seen_tweet_id: newestSeenTweetId ?? null,
        reached_last_seen: reachedLastSeen
      };
    } catch (error) {
      await ctx.runMutation(internalApi.xBookmarks.recordSyncFailure, {
        ownerAuthUserId: args.ownerAuthUserId,
        sourceKey: SYNC_SOURCE_KEY,
        lastRunAt: now,
        error: error instanceof Error ? error.message : "Unknown X bookmark sync failure"
      });

      throw error;
    }
  }
});

export const getSyncState = internalQuery({
  args: {
    ownerAuthUserId: v.string(),
    sourceKey: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("xBookmarkSyncState")
      .withIndex("by_owner_source_key", (q) =>
        q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("sourceKey", args.sourceKey)
      )
      .unique();
  }
});

export const recordSyncRun = internalMutation({
  args: {
    ownerAuthUserId: v.string(),
    sourceKey: v.string(),
    lastSeenTweetId: v.optional(v.string()),
    lastRunAt: v.number(),
    lastSuccessAt: v.number(),
    importedCount: v.number(),
    duplicateCount: v.number()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("xBookmarkSyncState")
      .withIndex("by_owner_source_key", (q) =>
        q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("sourceKey", args.sourceKey)
      )
      .unique();

    const next = {
      ownerAuthUserId: args.ownerAuthUserId,
      sourceKey: args.sourceKey,
      lastSeenTweetId: args.lastSeenTweetId,
      lastRunAt: args.lastRunAt,
      lastSuccessAt: args.lastSuccessAt,
      lastError: undefined,
      importedCount: args.importedCount,
      duplicateCount: args.duplicateCount,
      updatedAt: Date.now()
    };

    if (existing) {
      await ctx.db.patch(existing._id, next);
      return { ok: true };
    }

    await ctx.db.insert("xBookmarkSyncState", next);
    return { ok: true };
  }
});

export const recordSyncFailure = internalMutation({
  args: {
    ownerAuthUserId: v.string(),
    sourceKey: v.string(),
    lastRunAt: v.number(),
    error: v.string()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("xBookmarkSyncState")
      .withIndex("by_owner_source_key", (q) =>
        q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("sourceKey", args.sourceKey)
      )
      .unique();

    const next = {
      ownerAuthUserId: args.ownerAuthUserId,
      sourceKey: args.sourceKey,
      lastRunAt: args.lastRunAt,
      lastError: args.error,
      importedCount: existing?.importedCount ?? 0,
      duplicateCount: existing?.duplicateCount ?? 0,
      updatedAt: Date.now()
    };

    if (existing) {
      await ctx.db.patch(existing._id, next);
      return { ok: true };
    }

    await ctx.db.insert("xBookmarkSyncState", next);
    return { ok: true };
  }
});

async function resolveUserId(accessToken: string): Promise<string> {
  const response = await fetch("https://api.x.com/2/users/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await buildXApiError("users/me", response));
  }

  const payload = (await response.json()) as { data?: { id?: string } };
  const userId = payload.data?.id;
  if (!userId) {
    throw new Error("X bookmarks sync could not resolve the authenticated user ID");
  }

  return userId;
}

async function fetchBookmarksPage(input: {
  accessToken: string;
  userId: string;
  paginationToken?: string;
}): Promise<BookmarkPage> {
  const endpoint = new URL(`https://api.x.com/2/users/${input.userId}/bookmarks`);
  endpoint.searchParams.set("max_results", String(PAGE_SIZE));
  endpoint.searchParams.set(
    "expansions",
    [
      "article.cover_media",
      "article.media_entities",
      "attachments.media_keys",
      "attachments.media_source_tweet",
      "attachments.poll_ids",
      "author_id",
      "edit_history_tweet_ids",
      "entities.mentions.username",
      "geo.place_id",
      "in_reply_to_user_id",
      "entities.note.mentions.username",
      "referenced_tweets.id",
      "referenced_tweets.id.attachments.media_keys",
      "referenced_tweets.id.author_id"
    ].join(",")
  );
  endpoint.searchParams.set(
    "tweet.fields",
    [
      "article",
      "attachments",
      "author_id",
      "card_uri",
      "community_id",
      "context_annotations",
      "conversation_id",
      "created_at",
      "display_text_range",
      "edit_controls",
      "edit_history_tweet_ids",
      "entities",
      "geo",
      "id",
      "in_reply_to_user_id",
      "lang",
      "media_metadata",
      "note_tweet",
      "possibly_sensitive",
      "public_metrics",
      "referenced_tweets",
      "reply_settings",
      "scopes",
      "source",
      "suggested_source_links",
      "suggested_source_links_with_counts",
      "text"
    ].join(",")
  );
  endpoint.searchParams.set(
    "user.fields",
    [
      "created_at",
      "description",
      "entities",
      "id",
      "location",
      "most_recent_tweet_id",
      "name",
      "pinned_tweet_id",
      "profile_banner_url",
      "profile_image_url",
      "protected",
      "public_metrics",
      "url",
      "username",
      "verified",
      "verified_followers_count",
      "verified_type",
      "withheld"
    ].join(",")
  );
  endpoint.searchParams.set(
    "media.fields",
    ["alt_text", "duration_ms", "height", "media_key", "preview_image_url", "public_metrics", "type", "url", "variants", "width"].join(",")
  );
  endpoint.searchParams.set("poll.fields", ["duration_minutes", "end_datetime", "id", "options", "voting_status"].join(","));
  endpoint.searchParams.set("place.fields", ["contained_within", "country", "country_code", "full_name", "geo", "id", "name", "place_type"].join(","));

  if (input.paginationToken) {
    endpoint.searchParams.set("pagination_token", input.paginationToken);
  }

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await buildXApiError("bookmarks", response));
  }

  return (await response.json()) as BookmarkPage;
}

async function buildXApiError(endpointName: string, response: Response): Promise<string> {
  let detail = "";
  try {
    detail = await response.text();
  } catch {
    detail = "";
  }

  const suffix = detail ? `: ${detail.slice(0, 300)}` : "";
  return `X API ${endpointName} request failed (${response.status})${suffix}`;
}

function buildBookmarkContextResponse(page: BookmarkPage, tweet: XBookmarkTweet) {
  const includedTweets = (page.includes?.tweets ?? []) as Array<Record<string, unknown>>;
  const referencedTweetIds = Array.isArray((tweet as any)?.referenced_tweets)
    ? ((tweet as any).referenced_tweets as Array<{ id?: string }>).map((item) => item.id).filter(Boolean)
    : [];
  const relatedTweets = includedTweets.filter((item) => referencedTweetIds.includes(readString(item.id)));

  const relatedUserIds = new Set<string>();
  if (tweet.author_id) relatedUserIds.add(tweet.author_id);
  const replyToUserId = readString((tweet as any)?.in_reply_to_user_id);
  if (replyToUserId) relatedUserIds.add(replyToUserId);
  for (const item of relatedTweets) {
    const authorId = readString(item.author_id);
    if (authorId) relatedUserIds.add(authorId);
  }

  const relevantUsers = (page.includes?.users ?? []).filter((user) => relatedUserIds.has(user.id));
  const relevantMediaKeys = new Set<string>();
  collectMediaKeysFromTweet(tweet as any, relevantMediaKeys);
  for (const item of relatedTweets) {
    collectMediaKeysFromTweet(item as any, relevantMediaKeys);
  }
  const relevantMedia = (page.includes?.media ?? []).filter((media) => media.media_key && relevantMediaKeys.has(media.media_key));

  const pollIds = new Set<string>();
  collectPollIdsFromTweet(tweet as any, pollIds);
  for (const item of relatedTweets) {
    collectPollIdsFromTweet(item as any, pollIds);
  }
  const relevantPolls = (page.includes?.polls ?? []).filter((poll) => {
    const id = readString((poll as any)?.id);
    return id ? pollIds.has(id) : false;
  });

  const placeIds = new Set<string>();
  collectPlaceIdsFromTweet(tweet as any, placeIds);
  for (const item of relatedTweets) {
    collectPlaceIdsFromTweet(item as any, placeIds);
  }
  const relevantPlaces = (page.includes?.places ?? []).filter((place) => {
    const id = readString((place as any)?.id);
    return id ? placeIds.has(id) : false;
  });

  return {
    data: tweet,
    includes: {
      users: relevantUsers,
      media: relevantMedia,
      tweets: relatedTweets,
      polls: relevantPolls,
      places: relevantPlaces
    },
    meta: {
      result_count: page.meta?.result_count ?? null,
      next_token: page.meta?.next_token ?? null
    }
  };
}

function collectMediaKeysFromTweet(tweet: any, target: Set<string>) {
  for (const mediaKey of tweet?.attachments?.media_keys ?? []) {
    if (typeof mediaKey === "string" && mediaKey) target.add(mediaKey);
  }
  const coverMedia = readString(tweet?.article?.cover_media);
  if (coverMedia) target.add(coverMedia);
  for (const mediaKey of tweet?.article?.media_entities ?? []) {
    if (typeof mediaKey === "string" && mediaKey) target.add(mediaKey);
  }
}

function collectPollIdsFromTweet(tweet: any, target: Set<string>) {
  for (const pollId of tweet?.attachments?.poll_ids ?? []) {
    if (typeof pollId === "string" && pollId) target.add(pollId);
  }
}

function collectPlaceIdsFromTweet(tweet: any, target: Set<string>) {
  const placeId = readString(tweet?.geo?.place_id);
  if (placeId) target.add(placeId);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
