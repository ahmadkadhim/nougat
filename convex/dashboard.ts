import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent } from "./auth";
import {
  buildActivityPreview,
  compareActivityCaptures,
  getActivityAuthor,
  getActivityPostedAt,
  getActivitySourcedAt,
  getActivitySyncBatchAt
} from "./lib/activity";
import { buildXAuthorizeUrl, createOAuthState, createPkcePair, defaultXScopes } from "./lib/xOAuth";

export const getDashboardData = query({
  args: {
    captureLimit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const limit = Math.min(args.captureLimit ?? 12, 24);
    const captureCandidateLimit = Math.min(Math.max(limit * 10, 100), 250);

    const oauth = await ctx.db
      .query("xOAuthCredentials")
      .withIndex("by_owner_provider", (q) => q.eq("ownerAuthUserId", user._id).eq("provider", "x"))
      .unique();

    const sync = await ctx.db
      .query("xBookmarkSyncState")
      .withIndex("by_owner_source_key", (q) => q.eq("ownerAuthUserId", user._id).eq("sourceKey", "default"))
      .unique();

    const captures = await ctx.db
      .query("captures")
      .withIndex("by_owner_created_at", (q) => q.eq("ownerAuthUserId", user._id))
      .order("desc")
      .take(captureCandidateLimit);

    const failed = await ctx.db
      .query("captures")
      .withIndex("by_owner_created_at", (q) => q.eq("ownerAuthUserId", user._id))
      .order("desc")
      .filter((q) => q.eq(q.field("extractionStatus"), "failed"))
      .take(10);

    const dead = await ctx.db
      .query("captures")
      .withIndex("by_owner_created_at", (q) => q.eq("ownerAuthUserId", user._id))
      .order("desc")
      .filter((q) => q.eq(q.field("extractionStatus"), "dead_letter"))
      .take(10);

    const legacyXCredentials = await ctx.db
      .query("xOAuthCredentials")
      .withIndex("by_provider", (q) => q.eq("provider", "x"))
      .filter((q) => q.eq(q.field("ownerAuthUserId"), undefined))
      .first();

    const recentCaptures = [...captures].sort(compareActivityCaptures).slice(0, limit);
    const pendingTasks = await ctx.db
      .query("taskCandidates")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "pending_review"))
      .take(100);
    const pendingKnowledge = await ctx.db
      .query("knowledgeItems")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "pending_review"))
      .take(100);
    const pendingSkills = await ctx.db
      .query("skillCandidates")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "pending_review"))
      .take(100);
    const pendingResources = await ctx.db
      .query("resources")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "pending_review"))
      .take(100);
    const approvedResources = await ctx.db
      .query("resources")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "approved"))
      .take(100);
    const approvedTasks = await ctx.db
      .query("taskCandidates")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "approved"))
      .take(100);
    const approvedKnowledge = await ctx.db
      .query("knowledgeItems")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "approved"))
      .take(100);
    const topTags = await ctx.db.query("tags").withIndex("by_owner_usage", (q) => q.eq("ownerAuthUserId", user._id)).take(12);
    const authorProfiles = await ctx.db
      .query("authorProfiles")
      .withIndex("by_owner_author_key", (q) => q.eq("ownerAuthUserId", user._id))
      .take(20);

    return {
      user: {
        id: user._id,
        email: user.email,
        name: user.name ?? null
      },
      x: {
        connected: Boolean(oauth),
        username: oauth?.username ?? null,
        userId: oauth?.userId ?? null,
        scopes: oauth?.scopes ?? [],
        expiresAt: oauth?.expiresAt ?? null,
        updatedAt: oauth?.updatedAt ?? null
      },
      needsLegacyBootstrap: Boolean(!oauth && legacyXCredentials),
      sync: sync
        ? {
            importedCount: sync.importedCount,
            duplicateCount: sync.duplicateCount,
            lastSeenTweetId: sync.lastSeenTweetId ?? null,
            lastRunAt: sync.lastRunAt ?? null,
            lastSuccessAt: sync.lastSuccessAt ?? null,
            lastError: sync.lastError ?? null
          }
        : null,
      stats: {
        totalRecentCaptures: recentCaptures.length,
        failedCount: failed.length + dead.length,
        pendingReviewCount: pendingTasks.length + pendingKnowledge.length + pendingSkills.length + pendingResources.length,
        approvedTaskCount: approvedTasks.length,
        approvedKnowledgeCount: approvedKnowledge.length,
        approvedResourceCount: approvedResources.length
      },
      derived: {
        candidateCounts: {
          tasksPending: pendingTasks.length,
          knowledgePending: pendingKnowledge.length,
          skillsPending: pendingSkills.length,
          resourcesPending: pendingResources.length
        },
        topTags: [...topTags].sort((a, b) => b.usageCount - a.usageCount).slice(0, 8).map((tag) => ({
          tagId: tag.tagId,
          name: tag.name,
          usageCount: tag.usageCount
        })),
        authorSummaries: authorProfiles.slice(0, 6).map((profile) => ({
          authorKey: profile.authorKey,
          displayName: profile.displayName,
          currentTier: profile.currentTier ?? "Unrated"
        }))
      },
      recentCaptures: recentCaptures.map((capture) => {
        const preview = buildActivityPreview(capture);

        return {
          id: capture.captureId,
          title: preview.title,
          author: getActivityAuthor(capture),
          platform: capture.platform,
          status: capture.extractionStatus,
          captureMethod: capture.captureMethod,
          canonicalUrl: capture.canonicalUrl,
          sourcedAt: getActivitySourcedAt(capture),
          postedAt: getActivityPostedAt(capture),
          syncBatchAt: getActivitySyncBatchAt(capture),
          createdAt: capture.createdAt,
          xPost: preview.xPost
        };
      })
    };
  }
});

export const triggerBookmarkSync = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx as any);
    await ctx.scheduler.runAfter(0, internal.xBookmarks.runScheduledSyncForUser, {
      ownerAuthUserId: user._id
    });

    return {
      ok: true,
      queuedAt: Date.now()
    };
  }
});

export const beginXConnect = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const clientId = getRequiredEnv("X_OAUTH_CLIENT_ID");
    const redirectUri = `${getRequiredEnv("CONVEX_SITE_URL")}/v1/operator/x/oauth/callback`;
    const state = createOAuthState();
    const { verifier, challenge } = await createPkcePair();

    await ctx.runMutation(internal.xAuth.createOAuthState, {
      ownerAuthUserId: user._id,
      provider: "x",
      state,
      codeVerifier: verifier,
      redirectUri
    });

    return {
      url: buildXAuthorizeUrl({
        clientId,
        redirectUri,
        state,
        codeChallenge: challenge,
        scopes: defaultXScopes()
      })
    };
  }
});

export const bootstrapLegacyOwnership = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const ownerAuthUserId = user._id;

    const existingOwnedCredentials = await ctx.db
      .query("xOAuthCredentials")
      .withIndex("by_owner_provider", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("provider", "x"))
      .first();

    if (existingOwnedCredentials) {
      return { ok: true, migrated: false, reason: "already_owned" };
    }

    const legacyCredentials = await ctx.db
      .query("xOAuthCredentials")
      .withIndex("by_provider", (q) => q.eq("provider", "x"))
      .filter((q) => q.eq(q.field("ownerAuthUserId"), undefined))
      .first();

    const legacySync = await ctx.db
      .query("xBookmarkSyncState")
      .withIndex("by_source_key", (q) => q.eq("sourceKey", "default"))
      .filter((q) => q.eq(q.field("ownerAuthUserId"), undefined))
      .first();

    const legacyCaptures = await ctx.db
      .query("captures")
      .withIndex("by_created_at")
      .order("desc")
      .filter((q) =>
        q.and(
          q.eq(q.field("ownerAuthUserId"), undefined),
          q.eq(q.field("captureMethod"), "x_bookmark_sync"),
          q.eq(q.field("deviceId"), "system_x_bookmarks")
        )
      )
      .take(1000);

    if (legacyCredentials) {
      await ctx.db.patch(legacyCredentials._id, { ownerAuthUserId });
    }

    if (legacySync) {
      await ctx.db.patch(legacySync._id, { ownerAuthUserId });
    }

    for (const capture of legacyCaptures) {
      await ctx.db.patch(capture._id, { ownerAuthUserId });
    }

    return {
      ok: true,
      migrated: Boolean(legacyCredentials || legacySync || legacyCaptures.length),
      capturesClaimed: legacyCaptures.length
    };
  }
});

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
