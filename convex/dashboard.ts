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
import { normalizeUrl } from "./lib/normalize";
import { buildXAuthorizeUrl, createOAuthState, createPkcePair, defaultXScopes } from "./lib/xOAuth";

const dashboardCaptureStatusValidator = v.union(
  v.literal("all"),
  v.literal("queued"),
  v.literal("processing"),
  v.literal("enriched"),
  v.literal("partial"),
  v.literal("failed"),
  v.literal("dead_letter")
);

const dashboardCaptureSortValidator = v.union(
  v.literal("activity_desc"),
  v.literal("captured_desc"),
  v.literal("captured_asc"),
  v.literal("updated_desc"),
  v.literal("confidence_desc")
);

export const getDashboardData = query({
  args: {
    captureLimit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);

    const oauth = await ctx.db
      .query("xOAuthCredentials")
      .withIndex("by_owner_provider", (q) => q.eq("ownerAuthUserId", user._id).eq("provider", "x"))
      .unique();

    const sync = await ctx.db
      .query("xBookmarkSyncState")
      .withIndex("by_owner_source_key", (q) => q.eq("ownerAuthUserId", user._id).eq("sourceKey", "default"))
      .unique();

    const failed = await ctx.db
      .query("captures")
      .withIndex("by_owner_status_created_at", (q) => q.eq("ownerAuthUserId", user._id).eq("extractionStatus", "failed"))
      .order("desc")
      .take(10);

    const dead = await ctx.db
      .query("captures")
      .withIndex("by_owner_status_created_at", (q) => q.eq("ownerAuthUserId", user._id).eq("extractionStatus", "dead_letter"))
      .order("desc")
      .take(10);

    const legacyXCredentials = await ctx.db
      .query("xOAuthCredentials")
      .withIndex("by_provider", (q) => q.eq("provider", "x"))
      .filter((q) => q.eq(q.field("ownerAuthUserId"), undefined))
      .first();
    const topTags = await ctx.db.query("tags").withIndex("by_owner_usage", (q) => q.eq("ownerAuthUserId", user._id)).take(12);

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
        failedCount: failed.length + dead.length
      },
      derived: {
        topTags: [...topTags].sort((a, b) => b.usageCount - a.usageCount).slice(0, 8).map((tag) => ({
          tagId: tag.tagId,
          name: tag.name,
          slug: tag.slug,
          usageCount: tag.usageCount
        }))
      }
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

export const captureFromDashboard = mutation({
  args: {
    note: v.optional(v.string()),
    url: v.string()
  },
  handler: async (
    ctx,
    args
  ): Promise<{ canonical_url: string; capture_id: string; deduped: boolean; extraction_status: string }> => {
    const user = await authComponent.getAuthUser(ctx as any);
    const now = Date.now();
    const normalizedUrl = normalizeUrl(args.url);

    return await ctx.runMutation(internal.captures.ingestSystemCapture, {
      deviceId: `web_dashboard_${user._id}`,
      ownerAuthUserId: user._id,
      rawPayload: {
        dashboardManual: {
          note: args.note?.trim() || null,
          submittedAt: now
        }
      },
      request: {
        source_url: normalizedUrl,
        captured_at: now,
        capture_method: "manual",
        source_app: "web_dashboard",
        selected_text: args.note?.trim() || undefined,
        title_hint: args.note?.trim() || undefined
      }
    });
  }
});

export const listDashboardCaptures = query({
  args: {
    limit: v.optional(v.number()),
    platform: v.optional(v.string()),
    search: v.optional(v.string()),
    sort: v.optional(dashboardCaptureSortValidator),
    status: v.optional(dashboardCaptureStatusValidator),
    tag: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const ownerAuthUserId = user._id;
    const limit = Math.min(Math.max(args.limit ?? 20, 20), 80);
    const scanLimit = Math.min(Math.max(limit * 3, 80), 240);
    const normalizedPlatform = normalizeFilterValue(args.platform);
    const normalizedSearch = normalizeFilterValue(args.search);
    const normalizedStatus = args.status && args.status !== "all" ? args.status : null;
    const normalizedTag = normalizeFilterValue(args.tag);
    const captures =
      normalizedStatus
        ? await ctx.db
            .query("captures")
            .withIndex("by_owner_status_created_at", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("extractionStatus", normalizedStatus))
            .order("desc")
            .take(scanLimit)
        : normalizedPlatform && normalizedPlatform !== "all"
          ? await ctx.db
              .query("captures")
              .withIndex("by_owner_platform_created_at", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("platform", normalizedPlatform))
              .order("desc")
              .take(scanLimit)
          : await ctx.db
              .query("captures")
              .withIndex("by_owner_created_at", (q) => q.eq("ownerAuthUserId", ownerAuthUserId))
              .order("desc")
              .take(scanLimit);

    const matches: Array<{
      capture: (typeof captures)[number];
      preview: ReturnType<typeof buildActivityPreview>;
      tags: Array<{ name: string; role: string; slug: string }>;
    }> = [];

    for (const capture of captures) {
      if (normalizedPlatform && normalizedPlatform !== "all" && capture.platform !== normalizedPlatform) {
        continue;
      }

      if (normalizedStatus && capture.extractionStatus !== normalizedStatus) {
        continue;
      }

      const preview = buildActivityPreview(capture);
      const tags = normalizedTag ? await getCaptureTags(ctx, ownerAuthUserId, capture.captureId) : [];

      if (
        normalizedTag &&
        !tags.some((tag: { name: string; role: string; slug: string }) => tag.slug === normalizedTag || tag.name.toLowerCase() === normalizedTag)
      ) {
        continue;
      }

      if (normalizedSearch) {
        const haystack = buildCaptureSearchText(capture, preview.title, tags);
        if (!haystack.includes(normalizedSearch)) {
          continue;
        }
      }

      matches.push({
        capture,
        preview,
        tags
      });
    }

    matches.sort((left, right) => compareDashboardCaptureSort(left.capture, right.capture, args.sort ?? "activity_desc"));

    const visible = await Promise.all(
      matches.slice(0, limit).map(async ({ capture, preview, tags }) => {
        const captureTags = tags.length ? tags : await getCaptureTags(ctx, ownerAuthUserId, capture.captureId);
        const needsReview = await captureNeedsReview(ctx, ownerAuthUserId, capture.captureId);
        const excerpt =
          preview.xPost?.text ??
          capture.selectedText ??
          capture.tabContext ??
          capture.titleHint ??
          (capture.lastError ? `Last error: ${capture.lastError}` : null);

        return {
          author: getActivityAuthor(capture),
          canonicalUrl: capture.canonicalUrl,
          captureId: capture.captureId,
          captureMethod: capture.captureMethod,
          createdAt: capture.createdAt,
          excerpt,
          lastError: capture.lastError ?? null,
          needsReview,
          platform: capture.platform,
          postedAt: getActivityPostedAt(capture),
          sourcedAt: getActivitySourcedAt(capture),
          status: capture.extractionStatus,
          syncBatchAt: getActivitySyncBatchAt(capture),
          tags: captureTags,
          title: preview.title,
          xPost: preview.xPost
        };
      })
    );

    return {
      availablePlatforms: [...new Set(captures.map((capture) => capture.platform))].sort((left, right) => left.localeCompare(right)),
      hasMore: matches.length > limit,
      items: visible
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

function normalizeFilterValue(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function buildCaptureSearchText(
  capture: {
    author?: string;
    canonicalUrl: string;
    captureMethod: string;
    platform: string;
    selectedText?: string;
    tabContext?: string;
    titleHint?: string;
  },
  previewTitle: string,
  tags: Array<{ name: string; slug: string }>
): string {
  return [
    previewTitle,
    capture.titleHint,
    capture.author,
    capture.canonicalUrl,
    capture.platform,
    capture.captureMethod,
    capture.selectedText,
    capture.tabContext,
    ...tags.flatMap((tag) => [tag.name, tag.slug])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function compareDashboardCaptureSort(
  left: Parameters<typeof compareActivityCaptures>[0] & { confidence?: number; updatedAt: number },
  right: Parameters<typeof compareActivityCaptures>[0] & { confidence?: number; updatedAt: number },
  sort: "activity_desc" | "captured_desc" | "captured_asc" | "updated_desc" | "confidence_desc"
): number {
  switch (sort) {
    case "captured_desc":
      return right.capturedAt - left.capturedAt;
    case "captured_asc":
      return left.capturedAt - right.capturedAt;
    case "updated_desc":
      return right.updatedAt - left.updatedAt;
    case "confidence_desc":
      return (right.confidence ?? 0) - (left.confidence ?? 0) || compareActivityCaptures(left, right);
    case "activity_desc":
    default:
      return compareActivityCaptures(left, right);
  }
}

async function getCaptureTags(ctx: any, ownerAuthUserId: string, captureId: string) {
  const assignments = await ctx.db
    .query("tagAssignments")
    .withIndex("by_capture", (q: any) => q.eq("captureId", captureId))
    .collect();

  return assignments
    .filter((assignment: any) => assignment.ownerAuthUserId === ownerAuthUserId && assignment.reviewStatus !== "rejected")
    .sort((left: any, right: any) => {
      if (left.role === right.role) {
        return left.tagName.localeCompare(right.tagName);
      }

      return left.role === "primary" ? -1 : 1;
    })
    .slice(0, 4)
    .map((assignment: any) => ({
      name: assignment.tagName,
      role: assignment.role,
      slug: assignment.tagSlug
    }));
}

async function captureNeedsReview(ctx: any, ownerAuthUserId: string, captureId: string) {
  const [tags, authorRatings, notes, taskCandidates, skillCandidates, resources] = await Promise.all([
    ctx.db
      .query("tagAssignments")
      .withIndex("by_owner_capture_status", (q: any) =>
        q.eq("ownerAuthUserId", ownerAuthUserId).eq("captureId", captureId).eq("reviewStatus", "pending_review")
      )
      .take(1),
    ctx.db
      .query("authorRatings")
      .withIndex("by_owner_capture_status", (q: any) =>
        q.eq("ownerAuthUserId", ownerAuthUserId).eq("captureId", captureId).eq("reviewStatus", "pending_review")
      )
      .take(1),
    ctx.db
      .query("notes")
      .withIndex("by_owner_primary_capture", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", captureId))
      .filter((q: any) => q.eq(q.field("reviewStatus"), "pending_review"))
      .take(1),
    ctx.db
      .query("taskCandidates")
      .withIndex("by_owner_primary_capture", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", captureId))
      .filter((q: any) => q.eq(q.field("reviewStatus"), "pending_review"))
      .take(1),
    ctx.db
      .query("skillCandidates")
      .withIndex("by_owner_primary_capture", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", captureId))
      .filter((q: any) => q.eq(q.field("reviewStatus"), "pending_review"))
      .take(1),
    ctx.db
      .query("resources")
      .withIndex("by_owner_primary_capture", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", captureId))
      .filter((q: any) => q.eq(q.field("reviewStatus"), "pending_review"))
      .take(1)
  ]);

  return Boolean(
    tags.length ||
      authorRatings.length ||
      notes.length ||
      taskCandidates.length ||
      skillCandidates.length ||
      resources.length
  );
}
