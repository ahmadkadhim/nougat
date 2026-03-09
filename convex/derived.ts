import { v } from "convex/values";
import { authComponent } from "./auth";
import { api, internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { buildActivityPreview, getActivityAuthor, getActivityPostedAt, getActivitySourcedAt, getActivitySyncBatchAt } from "./lib/activity";
import {
  buildDerivedEvaluation,
  extractDocumentBody,
  normalizeResourceKey,
  normalizeSkillKey,
  normalizeTaskKey,
  slugifyTag,
  topicConflictKey
} from "./lib/derived";
import { deterministicMarkdownPath } from "./lib/normalize";

const reviewStatusValidator = v.union(v.literal("pending_review"), v.literal("approved"), v.literal("rejected"));
const entityTypeValidator = v.union(
  v.literal("tag_assignment"),
  v.literal("knowledge_item"),
  v.literal("task_candidate"),
  v.literal("skill_candidate"),
  v.literal("resource"),
  v.literal("author_rating"),
  v.literal("source_viewpoint")
);

export const processCapture = internalAction({
  args: { captureId: v.string() },
  handler: async (ctx, args) => {
    const input = await ctx.runQuery(internal.derived.getCaptureForEvaluation, {
      captureId: args.captureId
    });

    if (!input?.capture) {
      throw new Error(`Capture ${args.captureId} not found for derived evaluation`);
    }

    if (!input.capture.ownerAuthUserId) {
      return { ok: true, skipped: true, reason: "capture_has_no_owner" };
    }

    const run = await ctx.runMutation(internal.derived.beginProcessingRun, {
      captureId: args.captureId,
      ownerAuthUserId: input.capture.ownerAuthUserId,
      inputHash: input.capture.contentHash ?? input.capture.captureHash
    });

    try {
      const bundle = buildDerivedEvaluation({
        capture: input.capture,
        document: input.document,
        existingTagNames: input.existingTagNames
      });

      await ctx.runMutation(internal.derived.persistEvaluation, {
        captureId: args.captureId,
        ownerAuthUserId: input.capture.ownerAuthUserId,
        bundle
      });

      await ctx.runMutation(internal.derived.finishProcessingRun, {
        runId: run.runId,
        status: "completed"
      });

      return { ok: true, skipped: false };
    } catch (error) {
      await ctx.runMutation(internal.derived.finishProcessingRun, {
        runId: run.runId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown derived evaluation failure"
      });
      throw error;
    }
  }
});

export const getCaptureForEvaluation = internalQuery({
  args: { captureId: v.string() },
  handler: async (ctx, args) => {
    const capture = await ctx.db
      .query("captures")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .unique();

    const document = await ctx.db
      .query("markdownDocuments")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .unique();

    const existingTags = capture?.ownerAuthUserId
      ? await ctx.db.query("tags").withIndex("by_owner_usage", (q) => q.eq("ownerAuthUserId", capture.ownerAuthUserId)).take(200)
      : [];

    return {
      capture,
      document,
      existingTagNames: existingTags.map((tag) => tag.name)
    };
  }
});

export const beginProcessingRun = internalMutation({
  args: {
    captureId: v.string(),
    ownerAuthUserId: v.string(),
    inputHash: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const runId = `prun_${crypto.randomUUID()}`;
    await ctx.db.insert("processingRuns", {
      runId,
      ownerAuthUserId: args.ownerAuthUserId,
      captureId: args.captureId,
      stage: "evaluation",
      status: "processing",
      inputHash: args.inputHash,
      createdAt: now,
      updatedAt: now,
      startedAt: now
    });
    return { runId };
  }
});

export const finishProcessingRun = internalMutation({
  args: {
    runId: v.string(),
    status: v.union(v.literal("completed"), v.literal("failed")),
    error: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("processingRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .unique();
    if (!run) throw new Error("Processing run not found");
    const now = Date.now();
    await ctx.db.patch(run._id, {
      status: args.status,
      error: args.error,
      updatedAt: now,
      finishedAt: now
    });
    return { ok: true };
  }
});

export const persistEvaluation = internalMutation({
  args: {
    captureId: v.string(),
    ownerAuthUserId: v.string(),
    bundle: v.any()
  },
  handler: async (ctx, args) => {
    const capture = await ctx.db
      .query("captures")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .unique();
    if (!capture) throw new Error("Capture not found");

    const now = Date.now();
    await clearPendingSystemOutputs(ctx, args.ownerAuthUserId, args.captureId);

    const primaryTagSuggestion = (args.bundle.tags ?? []).find((item: any) => item.role === "primary") ?? args.bundle.tags?.[0];
    const primaryTag = primaryTagSuggestion
      ? await upsertTag(ctx, {
          ownerAuthUserId: args.ownerAuthUserId,
          name: primaryTagSuggestion.name,
          slug: primaryTagSuggestion.slug
        })
      : null;

    for (const tag of args.bundle.tags ?? []) {
      const tagRecord = tag.role === "primary" && primaryTag ? primaryTag : await upsertTag(ctx, {
        ownerAuthUserId: args.ownerAuthUserId,
        name: tag.name,
        slug: tag.slug,
        parentTagId: tag.role === "secondary" ? primaryTag?.tagId : undefined
      });

      await ctx.db.insert("tagAssignments", {
        assignmentId: `tagasn_${crypto.randomUUID()}`,
        ownerAuthUserId: args.ownerAuthUserId,
        captureId: args.captureId,
        tagId: tagRecord.tagId,
        tagName: tagRecord.name,
        tagSlug: tagRecord.slug,
        role: tag.role,
        sourceType: "system",
        reviewStatus: "pending_review",
        confidence: tag.confidence,
        justification: tag.justification,
        createdAt: now,
        updatedAt: now
      });
      await incrementTagUsage(ctx, tagRecord.tagId);
    }

    for (const item of args.bundle.knowledgeItems ?? []) {
      const existing = await findMergeableKnowledgeItem(ctx, args.ownerAuthUserId, item.title);
      const sourceQuote = item.sourceQuote ?? pickExcerptFromCapture(capture.rawPayload) ?? undefined;
      if (existing) {
        await ctx.db.patch(existing._id, {
          sourceCaptureIds: uniqueStrings([...existing.sourceCaptureIds, args.captureId]),
          sourceQuote: existing.sourceQuote ?? sourceQuote,
          updatedAt: now
        });
        await ensureKnowledgeItemSource(ctx, existing.knowledgeItemId, args.captureId, sourceQuote, item.content);
      } else {
        const knowledgeItemId = `know_${crypto.randomUUID()}`;
        await ctx.db.insert("knowledgeItems", {
          knowledgeItemId,
          ownerAuthUserId: args.ownerAuthUserId,
          primaryCaptureId: args.captureId,
          sourceCaptureIds: [args.captureId],
          sourceAuthor: capture.author,
          canonicalUrl: capture.canonicalUrl,
          tagSlug: primaryTag?.slug,
          title: item.title,
          content: item.content,
          sourceQuote,
          reviewStatus: "pending_review",
          confidence: item.confidence,
          justification: item.justification,
          createdAt: now,
          updatedAt: now
        });
        await ensureKnowledgeItemSource(ctx, knowledgeItemId, args.captureId, sourceQuote, item.content);
      }
    }

    for (const item of args.bundle.tasks ?? []) {
      const dedupeKey = normalizeTaskKey({
        assigneeType: item.assigneeType,
        tagSlug: primaryTag?.slug,
        title: item.title
      });
      const existing = await ctx.db
        .query("taskCandidates")
        .withIndex("by_owner_dedupe_key", (q) => q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("dedupeKey", dedupeKey))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          sourceCaptureIds: uniqueStrings([...existing.sourceCaptureIds, args.captureId]),
          updatedAt: now
        });
      } else {
        await ctx.db.insert("taskCandidates", {
          taskCandidateId: `task_${crypto.randomUUID()}`,
          ownerAuthUserId: args.ownerAuthUserId,
          primaryCaptureId: args.captureId,
          sourceCaptureIds: [args.captureId],
          sourceAuthor: capture.author,
          canonicalUrl: capture.canonicalUrl,
          tagSlug: primaryTag?.slug,
          title: item.title,
          details: item.details,
          assigneeType: item.assigneeType,
          executionTarget: item.executionTarget,
          suggestedAction: item.suggestedAction,
          dedupeKey,
          reviewStatus: "pending_review",
          confidence: item.confidence,
          justification: item.justification,
          createdAt: now,
          updatedAt: now
        });
      }
    }

    for (const item of args.bundle.skillCandidates ?? []) {
      const dedupeKey = normalizeSkillKey({
        targetSystem: item.targetSystem,
        tagSlug: primaryTag?.slug,
        title: item.title
      });
      const existing = await ctx.db
        .query("skillCandidates")
        .withIndex("by_owner_dedupe_key", (q) => q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("dedupeKey", dedupeKey))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          sourceCaptureIds: uniqueStrings([...existing.sourceCaptureIds, args.captureId]),
          updatedAt: now
        });
      } else {
        await ctx.db.insert("skillCandidates", {
          skillCandidateId: `skill_${crypto.randomUUID()}`,
          ownerAuthUserId: args.ownerAuthUserId,
          primaryCaptureId: args.captureId,
          sourceCaptureIds: [args.captureId],
          sourceAuthor: capture.author,
          canonicalUrl: capture.canonicalUrl,
          tagSlug: primaryTag?.slug,
          title: item.title,
          details: item.details,
          targetSystem: item.targetSystem,
          proposedChange: item.proposedChange,
          dedupeKey,
          reviewStatus: "pending_review",
          confidence: item.confidence,
          justification: item.justification,
          createdAt: now,
          updatedAt: now
        });
      }
    }

    for (const item of args.bundle.resources ?? []) {
      const dedupeKey = normalizeResourceKey({
        resourceUrl: item.resourceUrl
      });
      const existing = await ctx.db
        .query("resources")
        .withIndex("by_owner_dedupe_key", (q) => q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("dedupeKey", dedupeKey))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          sourceCaptureIds: uniqueStrings([...existing.sourceCaptureIds, args.captureId]),
          updatedAt: now
        });
      } else {
        const resourceDomain = readHostname(item.resourceUrl);
        await ctx.db.insert("resources", {
          resourceId: `res_${crypto.randomUUID()}`,
          ownerAuthUserId: args.ownerAuthUserId,
          primaryCaptureId: args.captureId,
          sourceCaptureIds: [args.captureId],
          sourceAuthor: capture.author,
          sourceCanonicalUrl: capture.canonicalUrl,
          resourceUrl: item.resourceUrl,
          resourceDomain,
          resourceType: item.resourceType,
          tagSlug: primaryTag?.slug,
          name: item.name,
          creator: item.creator,
          company: item.company,
          useCases: item.useCases ?? [],
          details: item.details,
          dedupeKey,
          reviewStatus: "pending_review",
          confidence: item.confidence,
          justification: item.justification,
          createdAt: now,
          updatedAt: now
        });
      }
    }

    const authorProfile = await upsertAuthorProfile(ctx, {
      ownerAuthUserId: args.ownerAuthUserId,
      capture
    });

    await ctx.db.insert("authorRatings", {
      authorRatingId: `arate_${crypto.randomUUID()}`,
      ownerAuthUserId: args.ownerAuthUserId,
      authorKey: authorProfile.authorKey,
      captureId: args.captureId,
      sourceAuthor: capture.author ?? "Unknown",
      suggestedTier: args.bundle.authorRating.suggestedTier,
      trustScore: args.bundle.authorRating.trustScore,
      signalScore: args.bundle.authorRating.signalScore,
      hypeScore: args.bundle.authorRating.hypeScore,
      relevanceScore: args.bundle.authorRating.relevanceScore,
      reviewStatus: "pending_review",
      confidence: args.bundle.authorRating.confidence,
      justification: args.bundle.authorRating.justification,
      createdAt: now,
      updatedAt: now
    });

    for (const viewpoint of args.bundle.viewpoints ?? []) {
      const conflictKey = topicConflictKey(viewpoint.topic, viewpoint.claim);
      const existing = await ctx.db
        .query("sourceViewpoints")
        .withIndex("by_owner_conflict_key", (q) => q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("conflictKey", conflictKey))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          updatedAt: now
        });
      } else {
        await ctx.db.insert("sourceViewpoints", {
          sourceViewpointId: `view_${crypto.randomUUID()}`,
          ownerAuthUserId: args.ownerAuthUserId,
          captureId: args.captureId,
          canonicalUrl: capture.canonicalUrl,
          sourceAuthor: capture.author,
          topic: viewpoint.topic,
          conflictKey,
          stance: viewpoint.stance,
          claim: viewpoint.claim,
          rationale: viewpoint.rationale,
          evidenceQuote: viewpoint.evidenceQuote,
          reviewStatus: "pending_review",
          confidence: viewpoint.confidence,
          justification: viewpoint.justification,
          createdAt: now,
          updatedAt: now
        });
      }
    }

    return { ok: true };
  }
});

export const getDerivedSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const ownerAuthUserId = user._id;
    const pendingTasks = await ctx.db.query("taskCandidates").withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review")).take(100);
    const approvedTasks = await ctx.db.query("taskCandidates").withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "approved")).take(100);
    const approvedKnowledge = await ctx.db.query("knowledgeItems").withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "approved")).take(100);
    const approvedResources = await ctx.db.query("resources").withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "approved")).take(100);
    const pendingKnowledge = await ctx.db.query("knowledgeItems").withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review")).take(100);
    const pendingSkills = await ctx.db.query("skillCandidates").withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review")).take(100);
    const pendingResources = await ctx.db.query("resources").withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review")).take(100);
    const pendingRatings = await ctx.db.query("authorRatings").withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review")).take(100);
    const topTags = await ctx.db.query("tags").withIndex("by_owner_usage", (q) => q.eq("ownerAuthUserId", ownerAuthUserId)).take(12);
    const profiles = await ctx.db.query("authorProfiles").withIndex("by_owner_author_key", (q) => q.eq("ownerAuthUserId", ownerAuthUserId)).take(50);

    return {
      candidateCounts: {
        tasksPending: pendingTasks.length,
        knowledgePending: pendingKnowledge.length,
        skillsPending: pendingSkills.length,
        resourcesPending: pendingResources.length,
        authorRatingsPending: pendingRatings.length
      },
      approvedTaskCount: approvedTasks.length,
      approvedKnowledgeCount: approvedKnowledge.length,
      approvedResourceCount: approvedResources.length,
      topTags: [...topTags].sort((a, b) => b.usageCount - a.usageCount).slice(0, 8).map((tag) => ({
        tagId: tag.tagId,
        name: tag.name,
        slug: tag.slug,
        usageCount: tag.usageCount
      })),
      authorSummaries: profiles.slice(0, 8).map((profile) => ({
        authorKey: profile.authorKey,
        displayName: profile.displayName,
        currentTier: profile.currentTier ?? "Unrated",
        trustScore: profile.trustScore ?? null,
        signalScore: profile.signalScore ?? null,
        hypeScore: profile.hypeScore ?? null,
        relevanceScore: profile.relevanceScore ?? null
      }))
    };
  }
});

export const getReviewQueue = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const ownerAuthUserId = user._id;
    const limit = Math.min(args.limit ?? 12, 24);

    const captures = await ctx.db
      .query("captures")
      .withIndex("by_owner_created_at", (q) => q.eq("ownerAuthUserId", ownerAuthUserId))
      .order("desc")
      .take(120);

    const queue: any[] = [];

    for (const capture of captures) {
      const [tagAssignments, knowledgeItems, taskCandidates, skillCandidates, resources, authorRatings, viewpoints] = await Promise.all([
        ctx.db
          .query("tagAssignments")
          .withIndex("by_owner_capture_status", (q) =>
            q.eq("ownerAuthUserId", ownerAuthUserId).eq("captureId", capture.captureId).eq("reviewStatus", "pending_review")
          )
          .collect(),
        ctx.db
          .query("knowledgeItems")
          .withIndex("by_owner_primary_capture", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", capture.captureId))
          .filter((q) => q.eq(q.field("reviewStatus"), "pending_review"))
          .collect(),
        ctx.db
          .query("taskCandidates")
          .withIndex("by_owner_primary_capture", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", capture.captureId))
          .filter((q) => q.eq(q.field("reviewStatus"), "pending_review"))
          .collect(),
        ctx.db
          .query("skillCandidates")
          .withIndex("by_owner_primary_capture", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", capture.captureId))
          .filter((q) => q.eq(q.field("reviewStatus"), "pending_review"))
          .collect(),
        ctx.db
          .query("resources")
          .withIndex("by_owner_primary_capture", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", capture.captureId))
          .filter((q) => q.eq(q.field("reviewStatus"), "pending_review"))
          .collect(),
        ctx.db
          .query("authorRatings")
          .withIndex("by_owner_capture_status", (q) =>
            q.eq("ownerAuthUserId", ownerAuthUserId).eq("captureId", capture.captureId).eq("reviewStatus", "pending_review")
          )
          .collect(),
        ctx.db
          .query("sourceViewpoints")
          .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
          .filter((q) => q.eq(q.field("captureId"), capture.captureId))
          .collect()
      ]);

      const pendingCount =
        tagAssignments.length +
        knowledgeItems.length +
        taskCandidates.length +
        skillCandidates.length +
        resources.length +
        authorRatings.length +
        viewpoints.length;

      if (!pendingCount) continue;

      const preview = buildActivityPreview(capture);
      queue.push({
        capture: {
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
          xPost: preview.xPost
        },
        pendingCount,
        tags: tagAssignments.map((item) => ({
          id: item.assignmentId,
          name: item.tagName,
          slug: item.tagSlug,
          role: item.role,
          confidence: item.confidence,
          justification: item.justification ?? ""
        })),
        knowledgeItems: knowledgeItems.map((item) => ({
          id: item.knowledgeItemId,
          title: item.title,
          content: item.content,
          sourceQuote: item.sourceQuote ?? "",
          confidence: item.confidence,
          justification: item.justification ?? ""
        })),
        taskCandidates: taskCandidates.map((item) => ({
          id: item.taskCandidateId,
          title: item.title,
          details: item.details,
          assigneeType: item.assigneeType,
          suggestedAction: item.suggestedAction ?? "",
          confidence: item.confidence,
          justification: item.justification ?? ""
        })),
        skillCandidates: skillCandidates.map((item) => ({
          id: item.skillCandidateId,
          title: item.title,
          details: item.details,
          proposedChange: item.proposedChange,
          targetSystem: item.targetSystem,
          confidence: item.confidence,
          justification: item.justification ?? ""
        })),
        resources: resources.map((item) => ({
          id: item.resourceId,
          name: item.name,
          resourceType: item.resourceType,
          resourceUrl: item.resourceUrl,
          company: item.company ?? "",
          creator: item.creator ?? "",
          useCases: item.useCases,
          details: item.details,
          confidence: item.confidence,
          justification: item.justification ?? ""
        })),
        authorRatings: authorRatings.map((item) => ({
          id: item.authorRatingId,
          sourceAuthor: item.sourceAuthor,
          suggestedTier: item.suggestedTier,
          trustScore: item.trustScore,
          signalScore: item.signalScore,
          hypeScore: item.hypeScore,
          relevanceScore: item.relevanceScore,
          confidence: item.confidence,
          justification: item.justification ?? ""
        })),
        viewpoints: viewpoints.map((item) => ({
          id: item.sourceViewpointId,
          topic: item.topic,
          stance: item.stance,
          claim: item.claim,
          rationale: item.rationale ?? "",
          evidenceQuote: item.evidenceQuote ?? "",
          confidence: item.confidence,
          justification: item.justification ?? ""
        }))
      });

      if (queue.length >= limit) break;
    }

    return { items: queue };
  }
});

export const listTasks = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const limit = Math.min(args.limit ?? 50, 200);
    const rows = await ctx.db
      .query("taskCandidates")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "approved"))
      .take(limit);
    const sorted = rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return await Promise.all(
      sorted.map(async (item) => ({
        ...item,
        sourceCaptureCount: item.sourceCaptureIds.length,
        sourceUrl: item.canonicalUrl,
        relatedViewpoints: await getApprovedViewpointsForCaptures(ctx, user._id, item.sourceCaptureIds)
      }))
    );
  }
});

export const listKnowledge = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const limit = Math.min(args.limit ?? 50, 200);
    const rows = await ctx.db
      .query("knowledgeItems")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "approved"))
      .take(limit);
    const sorted = rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return await Promise.all(
      sorted.map(async (item) => ({
        ...item,
        sourceCaptureCount: item.sourceCaptureIds.length,
        sourceUrl: item.canonicalUrl,
        relatedViewpoints: await getApprovedViewpointsForCaptures(ctx, user._id, item.sourceCaptureIds)
      }))
    );
  }
});

export const listSkills = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const limit = Math.min(args.limit ?? 50, 200);
    const rows = await ctx.db
      .query("skillCandidates")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "approved"))
      .take(limit);
    const sorted = rows.sort((a, b) => b.updatedAt - a.updatedAt);
    return await Promise.all(
      sorted.map(async (item) => ({
        ...item,
        sourceCaptureCount: item.sourceCaptureIds.length,
        sourceUrl: item.canonicalUrl,
        relatedViewpoints: await getApprovedViewpointsForCaptures(ctx, user._id, item.sourceCaptureIds)
      }))
    );
  }
});

export const listResources = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const limit = Math.min(args.limit ?? 50, 200);
    const rows = await ctx.db
      .query("resources")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "approved"))
      .take(limit);
    return rows.sort((a, b) => b.updatedAt - a.updatedAt).map((item) => ({
      ...item,
      sourceCaptureCount: item.sourceCaptureIds.length,
      sourceUrl: item.sourceCanonicalUrl
    }));
  }
});

export const listViewpointTopics = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const limit = Math.min(args.limit ?? 100, 250);
    const rows = await ctx.db
      .query("sourceViewpoints")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "approved"))
      .take(limit);

    const groups = new Map<string, Array<{
      sourceViewpointId: string;
      claim: string;
      stance: string;
      sourceAuthor?: string;
      canonicalUrl: string;
      rationale?: string;
      evidenceQuote?: string;
      confidence: number;
      updatedAt: number;
    }>>();

    for (const row of rows) {
      const key = row.topic;
      const current = groups.get(key) ?? [];
      current.push({
        sourceViewpointId: row.sourceViewpointId,
        claim: row.claim,
        stance: row.stance,
        sourceAuthor: row.sourceAuthor,
        canonicalUrl: row.canonicalUrl,
        rationale: row.rationale,
        evidenceQuote: row.evidenceQuote,
        confidence: row.confidence,
        updatedAt: row.updatedAt
      });
      groups.set(key, current);
    }

    return [...groups.entries()]
      .map(([topic, items]) => ({
        topic,
        items: items.sort((a, b) => b.updatedAt - a.updatedAt),
        stanceCount: new Set(items.map((item) => item.stance)).size,
        totalCount: items.length
      }))
      .sort((a, b) => b.totalCount - a.totalCount || a.topic.localeCompare(b.topic));
  }
});

export const listPendingKnowledgeMarkdown = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 300);
    return await ctx.db
      .query("knowledgeItems")
      .withIndex("by_owner_export_status", (q) => q.eq("ownerAuthUserId", undefined).eq("exportStatus", "pending"))
      .take(limit);
  }
});

export const listPendingKnowledgeMarkdownForOwner = query({
  args: { ownerAuthUserId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 300);
    return await ctx.db
      .query("knowledgeItems")
      .withIndex("by_owner_export_status", (q) => q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("exportStatus", "pending"))
      .take(limit);
  }
});

export const listPendingResourceMarkdownForOwner = query({
  args: { ownerAuthUserId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 300);
    return await ctx.db
      .query("resources")
      .withIndex("by_owner_export_status", (q) => q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("exportStatus", "pending"))
      .take(limit);
  }
});

export const markKnowledgeMarkdownExported = mutation({
  args: { knowledgeItemId: v.string() },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("knowledgeItems")
      .withIndex("by_knowledge_item_id", (q) => q.eq("knowledgeItemId", args.knowledgeItemId))
      .unique();
    if (!item) throw new Error("Knowledge item not found");
    const now = Date.now();
    await ctx.db.patch(item._id, {
      exportStatus: "exported",
      updatedAt: now
    });
    return { ok: true };
  }
});

export const markResourceMarkdownExported = mutation({
  args: { resourceId: v.string() },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("resources")
      .withIndex("by_resource_id", (q) => q.eq("resourceId", args.resourceId))
      .unique();
    if (!item) throw new Error("Resource not found");
    const now = Date.now();
    await ctx.db.patch(item._id, {
      exportStatus: "exported",
      updatedAt: now
    });
    return { ok: true };
  }
});

export const reviewEntity = mutation({
  args: {
    entityType: entityTypeValidator,
    entityId: v.string(),
    action: v.union(v.literal("approve"), v.literal("reject"), v.literal("save")),
    updates: v.optional(v.any()),
    comment: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const ownerAuthUserId = user._id;
    const now = Date.now();

    const target = await findEntity(ctx, args.entityType, args.entityId);
    if (!target || target.ownerAuthUserId !== ownerAuthUserId) {
      throw new Error("Review target not found");
    }

    const before = summarizeEntity(target, args.entityType);
    const patch = buildReviewPatch(args.entityType, args.action, args.updates ?? {}, now, ownerAuthUserId, ctx);
    const resolvedPatch = compactPatch(patch instanceof Promise ? await patch : patch);

    await ctx.db.patch(target._id, resolvedPatch);

    if (args.entityType === "author_rating" && (args.action === "approve" || args.action === "save")) {
      await applyAuthorProfileUpdateFromRating(ctx, target.authorKey, ownerAuthUserId, {
        currentTier: resolvedPatch.suggestedTier ?? target.suggestedTier,
        trustScore: resolvedPatch.trustScore ?? target.trustScore,
        signalScore: resolvedPatch.signalScore ?? target.signalScore,
        hypeScore: resolvedPatch.hypeScore ?? target.hypeScore,
        relevanceScore: resolvedPatch.relevanceScore ?? target.relevanceScore
      });
    }

    if (args.entityType === "knowledge_item" && (args.action === "approve" || (args.action === "save" && resolvedPatch.reviewStatus === "approved"))) {
      await ensureKnowledgeMarkdown(ctx, args.entityId);
    }
    if (args.entityType === "resource" && (args.action === "approve" || (args.action === "save" && resolvedPatch.reviewStatus === "approved"))) {
      await ensureResourceMarkdown(ctx, args.entityId);
    }

    await ctx.db.insert("reviewFeedback", {
      feedbackId: `feedback_${crypto.randomUUID()}`,
      ownerAuthUserId,
      entityType: args.entityType,
      entityId: args.entityId,
      action: args.action,
      before,
      after: resolvedPatch,
      comment: args.comment,
      createdAt: now
    });

    return { ok: true };
  }
});

async function clearPendingSystemOutputs(ctx: any, ownerAuthUserId: string, captureId: string) {
  const tagAssignments = await ctx.db
    .query("tagAssignments")
    .withIndex("by_owner_capture_status", (q: any) =>
      q.eq("ownerAuthUserId", ownerAuthUserId).eq("captureId", captureId).eq("reviewStatus", "pending_review")
    )
    .collect();
  for (const row of tagAssignments) {
    await ctx.db.delete(row._id);
  }

  await deleteByPrimaryCapture(ctx, "knowledgeItems", ownerAuthUserId, captureId);
  await deleteByPrimaryCapture(ctx, "taskCandidates", ownerAuthUserId, captureId);
  await deleteByPrimaryCapture(ctx, "skillCandidates", ownerAuthUserId, captureId);
  await deleteByPrimaryCapture(ctx, "resources", ownerAuthUserId, captureId);

  const ratings = await ctx.db
    .query("authorRatings")
    .withIndex("by_owner_capture_status", (q: any) =>
      q.eq("ownerAuthUserId", ownerAuthUserId).eq("captureId", captureId).eq("reviewStatus", "pending_review")
    )
    .collect();
  for (const row of ratings) {
    await ctx.db.delete(row._id);
  }

  const viewpoints = await ctx.db
    .query("sourceViewpoints")
    .withIndex("by_owner_review_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
    .filter((q: any) => q.eq(q.field("captureId"), captureId))
    .collect();
  for (const row of viewpoints) {
    await ctx.db.delete(row._id);
  }
}

async function deleteByPrimaryCapture(ctx: any, table: "knowledgeItems" | "taskCandidates" | "skillCandidates" | "resources", ownerAuthUserId: string, captureId: string) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_owner_primary_capture", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", captureId))
    .filter((q: any) => q.eq(q.field("reviewStatus"), "pending_review"))
    .collect();
  for (const row of rows) {
    if (table === "knowledgeItems") {
      const sources = await ctx.db
        .query("knowledgeItemSources")
        .withIndex("by_knowledge_item", (q: any) => q.eq("knowledgeItemId", row.knowledgeItemId))
        .collect();
      for (const source of sources) {
        await ctx.db.delete(source._id);
      }
    }
    await ctx.db.delete(row._id);
  }
}

async function upsertTag(
  ctx: any,
  input: { description?: string; name: string; ownerAuthUserId: string; parentTagId?: string; slug: string }
) {
  const existing = await ctx.db
    .query("tags")
    .withIndex("by_owner_slug", (q: any) => q.eq("ownerAuthUserId", input.ownerAuthUserId).eq("slug", input.slug))
    .unique();
  const now = Date.now();
  if (existing) {
    if (input.parentTagId && !existing.parentTagId) {
      await ctx.db.patch(existing._id, {
        parentTagId: input.parentTagId,
        updatedAt: now
      });
    }
    return existing;
  }

  const tagId = `tag_${crypto.randomUUID()}`;
  await ctx.db.insert("tags", {
    tagId,
    ownerAuthUserId: input.ownerAuthUserId,
    name: input.name,
    slug: input.slug,
    parentTagId: input.parentTagId,
    description: input.description,
    usageCount: 0,
    createdAt: now,
    updatedAt: now
  });

  return {
    tagId,
    ownerAuthUserId: input.ownerAuthUserId,
    name: input.name,
    slug: input.slug
  };
}

async function incrementTagUsage(ctx: any, tagId: string) {
  const tag = await ctx.db.query("tags").withIndex("by_tag_id", (q: any) => q.eq("tagId", tagId)).unique();
  if (!tag) return;
  await ctx.db.patch(tag._id, {
    usageCount: tag.usageCount + 1,
    updatedAt: Date.now()
  });
}

async function findMergeableKnowledgeItem(ctx: any, ownerAuthUserId: string, title: string) {
  const pending = await ctx.db
    .query("knowledgeItems")
    .withIndex("by_owner_review_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
    .take(100);
  const targetSlug = slugifyTag(title);
  return pending.find((item: any) => slugifyTag(item.title) === targetSlug);
}

async function getApprovedViewpointsForCaptures(ctx: any, ownerAuthUserId: string, captureIds: string[]) {
  if (captureIds.length === 0) return [];
  const viewpoints = await ctx.db
    .query("sourceViewpoints")
    .withIndex("by_owner_review_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "approved"))
    .take(200);

  return viewpoints
    .filter((item: any) => captureIds.includes(item.captureId))
    .sort((a: any, b: any) => b.updatedAt - a.updatedAt)
    .map((item: any) => ({
      sourceViewpointId: item.sourceViewpointId,
      topic: item.topic,
      stance: item.stance,
      claim: item.claim,
      rationale: item.rationale ?? "",
      evidenceQuote: item.evidenceQuote ?? "",
      sourceAuthor: item.sourceAuthor ?? "",
      canonicalUrl: item.canonicalUrl,
      confidence: item.confidence
    }));
}

async function ensureKnowledgeItemSource(ctx: any, knowledgeItemId: string, captureId: string, quote: string | undefined, excerpt: string) {
  const existing = await ctx.db
    .query("knowledgeItemSources")
    .withIndex("by_knowledge_item", (q: any) => q.eq("knowledgeItemId", knowledgeItemId))
    .filter((q: any) => q.eq(q.field("captureId"), captureId))
    .first();
  if (existing) return;
  await ctx.db.insert("knowledgeItemSources", {
    knowledgeItemId,
    captureId,
    quote,
    excerpt,
    createdAt: Date.now()
  });
}

async function upsertAuthorProfile(ctx: any, input: { ownerAuthUserId: string; capture: any }) {
  const platformAuthorId = readString(input.capture.platformIds?.author_id);
  const username = readString((input.capture.rawPayload as any)?.author_profile?.username) ?? readString((input.capture.rawPayload as any)?.x_user?.username);
  const authorKey = `${input.capture.platform}:${platformAuthorId ?? username ?? slugifyTag(input.capture.author ?? input.capture.canonicalUrl)}`;
  const existing = await ctx.db
    .query("authorProfiles")
    .withIndex("by_owner_author_key", (q: any) => q.eq("ownerAuthUserId", input.ownerAuthUserId).eq("authorKey", authorKey))
    .unique();
  const now = Date.now();
  if (existing) return existing;
  await ctx.db.insert("authorProfiles", {
    authorKey,
    ownerAuthUserId: input.ownerAuthUserId,
    platform: input.capture.platform,
    platformAuthorId,
    displayName: input.capture.author ?? username ?? "Unknown",
    username,
    createdAt: now,
    updatedAt: now
  });
  return {
    authorKey,
    ownerAuthUserId: input.ownerAuthUserId,
    platform: input.capture.platform,
    platformAuthorId,
    displayName: input.capture.author ?? username ?? "Unknown",
    username
  };
}

async function findEntity(ctx: any, entityType: string, entityId: string) {
  switch (entityType) {
    case "tag_assignment":
      return await ctx.db.query("tagAssignments").withIndex("by_assignment_id", (q: any) => q.eq("assignmentId", entityId)).unique();
    case "knowledge_item":
      return await ctx.db.query("knowledgeItems").withIndex("by_knowledge_item_id", (q: any) => q.eq("knowledgeItemId", entityId)).unique();
    case "task_candidate":
      return await ctx.db.query("taskCandidates").withIndex("by_task_candidate_id", (q: any) => q.eq("taskCandidateId", entityId)).unique();
    case "skill_candidate":
      return await ctx.db.query("skillCandidates").withIndex("by_skill_candidate_id", (q: any) => q.eq("skillCandidateId", entityId)).unique();
    case "resource":
      return await ctx.db.query("resources").withIndex("by_resource_id", (q: any) => q.eq("resourceId", entityId)).unique();
    case "author_rating":
      return await ctx.db.query("authorRatings").withIndex("by_author_rating_id", (q: any) => q.eq("authorRatingId", entityId)).unique();
    case "source_viewpoint":
      return await ctx.db.query("sourceViewpoints").withIndex("by_source_viewpoint_id", (q: any) => q.eq("sourceViewpointId", entityId)).unique();
    default:
      return null;
  }
}

async function buildReviewPatch(entityType: string, action: string, updates: any, now: number, ownerAuthUserId: string, ctx: any) {
  const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : undefined;

  switch (entityType) {
    case "tag_assignment": {
      const nextName = readString(updates.name);
      let nextTagFields = {};
      if (nextName) {
        const tag = await upsertTag(ctx, {
          ownerAuthUserId,
          name: nextName,
          slug: slugifyTag(nextName)
        });
        nextTagFields = {
          tagId: tag.tagId,
          tagName: tag.name,
          tagSlug: tag.slug
        };
      }
      return {
        ...nextTagFields,
        role: updates.role === "primary" || updates.role === "secondary" ? updates.role : undefined,
        confidence: typeof updates.confidence === "number" ? updates.confidence : undefined,
        justification: readString(updates.justification) ?? undefined,
        reviewStatus: status,
        reviewedAt: status ? now : undefined,
        updatedAt: now
      };
    }
    case "knowledge_item":
      return {
        title: readString(updates.title) ?? undefined,
        content: readString(updates.content) ?? undefined,
        sourceQuote: readString(updates.sourceQuote) ?? undefined,
        confidence: typeof updates.confidence === "number" ? updates.confidence : undefined,
        justification: readString(updates.justification) ?? undefined,
        reviewStatus: status,
        approvedAt: status === "approved" ? now : undefined,
        exportStatus: status === "approved" ? "pending" : undefined,
        updatedAt: now
      };
    case "task_candidate":
      return {
        title: readString(updates.title) ?? undefined,
        details: readString(updates.details) ?? undefined,
        assigneeType: updates.assigneeType === "agent" || updates.assigneeType === "user" ? updates.assigneeType : undefined,
        suggestedAction: readString(updates.suggestedAction) ?? undefined,
        justification: readString(updates.justification) ?? undefined,
        reviewStatus: status,
        approvedAt: status === "approved" ? now : undefined,
        updatedAt: now
      };
    case "skill_candidate":
      return {
        title: readString(updates.title) ?? undefined,
        details: readString(updates.details) ?? undefined,
        proposedChange: readString(updates.proposedChange) ?? undefined,
        targetSystem: readString(updates.targetSystem) ?? undefined,
        justification: readString(updates.justification) ?? undefined,
        reviewStatus: status,
        approvedAt: status === "approved" ? now : undefined,
        updatedAt: now
      };
    case "resource":
      const resourceUrl = readString(updates.resourceUrl);
      return {
        name: readString(updates.name) ?? undefined,
        resourceType: readString(updates.resourceType) ?? undefined,
        resourceUrl: resourceUrl ?? undefined,
        resourceDomain: resourceUrl ? readHostname(resourceUrl) : undefined,
        company: readString(updates.company) ?? undefined,
        creator: readString(updates.creator) ?? undefined,
        details: readString(updates.details) ?? undefined,
        useCases: Array.isArray(updates.useCases)
          ? updates.useCases.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
          : typeof updates.useCases === "string"
            ? updates.useCases.split(",").map((item: string) => item.trim()).filter(Boolean)
            : undefined,
        dedupeKey: resourceUrl ? normalizeResourceKey({ resourceUrl }) : undefined,
        justification: readString(updates.justification) ?? undefined,
        reviewStatus: status,
        approvedAt: status === "approved" ? now : undefined,
        exportStatus: status === "approved" ? "pending" : undefined,
        updatedAt: now
      };
    case "author_rating":
      return {
        suggestedTier: readString(updates.suggestedTier) ?? undefined,
        trustScore: typeof updates.trustScore === "number" ? updates.trustScore : undefined,
        signalScore: typeof updates.signalScore === "number" ? updates.signalScore : undefined,
        hypeScore: typeof updates.hypeScore === "number" ? updates.hypeScore : undefined,
        relevanceScore: typeof updates.relevanceScore === "number" ? updates.relevanceScore : undefined,
        justification: readString(updates.justification) ?? undefined,
        reviewStatus: status,
        reviewedAt: status ? now : undefined,
        updatedAt: now
      };
    case "source_viewpoint":
      return {
        topic: readString(updates.topic) ?? undefined,
        claim: readString(updates.claim) ?? undefined,
        rationale: readString(updates.rationale) ?? undefined,
        evidenceQuote: readString(updates.evidenceQuote) ?? undefined,
        stance: ["do", "avoid", "caution", "tradeoff"].includes(updates.stance) ? updates.stance : undefined,
        justification: readString(updates.justification) ?? undefined,
        reviewStatus: status,
        reviewedAt: status ? now : undefined,
        updatedAt: now
      };
    default:
      return { updatedAt: now };
  }
}

function summarizeEntity(target: any, entityType: string) {
  switch (entityType) {
    case "tag_assignment":
      return { tagName: target.tagName, role: target.role };
    case "knowledge_item":
      return { title: target.title, content: target.content };
    case "task_candidate":
      return { title: target.title, details: target.details, assigneeType: target.assigneeType };
    case "skill_candidate":
      return { title: target.title, proposedChange: target.proposedChange };
    case "resource":
      return { name: target.name, resourceType: target.resourceType, resourceUrl: target.resourceUrl };
    case "author_rating":
      return {
        suggestedTier: target.suggestedTier,
        trustScore: target.trustScore,
        signalScore: target.signalScore,
        hypeScore: target.hypeScore,
        relevanceScore: target.relevanceScore
      };
    case "source_viewpoint":
      return { topic: target.topic, claim: target.claim, stance: target.stance };
    default:
      return {};
  }
}

async function applyAuthorProfileUpdateFromRating(ctx: any, authorKey: string, ownerAuthUserId: string, next: any) {
  const profile = await ctx.db
    .query("authorProfiles")
    .withIndex("by_owner_author_key", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("authorKey", authorKey))
    .unique();
  if (!profile) return;
  await ctx.db.patch(profile._id, {
    currentTier: next.currentTier,
    trustScore: next.trustScore,
    signalScore: next.signalScore,
    hypeScore: next.hypeScore,
    relevanceScore: next.relevanceScore,
    updatedAt: Date.now()
  });
}

async function ensureKnowledgeMarkdown(ctx: any, knowledgeItemId: string) {
  const item = await ctx.db
    .query("knowledgeItems")
    .withIndex("by_knowledge_item_id", (q: any) => q.eq("knowledgeItemId", knowledgeItemId))
    .unique();
  if (!item) return;
  const capture = await ctx.db
    .query("captures")
    .withIndex("by_capture_id", (q: any) => q.eq("captureId", item.primaryCaptureId))
    .unique();
  if (!capture) return;

  const path = deterministicMarkdownPath({
    capturedAt: capture.capturedAt,
    platform: "knowledge",
    captureId: item.knowledgeItemId
  }).replace("/knowledge-", "/note-");

  const markdown = [
    "---",
    `id: "${item.knowledgeItemId}"`,
    `source_capture_ids: ${JSON.stringify(item.sourceCaptureIds)}`,
    `canonical_url: "${item.canonicalUrl}"`,
    `source_author: ${item.sourceAuthor ? JSON.stringify(item.sourceAuthor) : "null"}`,
    `tag: ${item.tagSlug ? JSON.stringify(item.tagSlug) : "null"}`,
    "---",
    "",
    `# ${item.title}`,
    "",
    item.content,
    item.sourceQuote ? `\n\n> ${item.sourceQuote}` : ""
  ]
    .join("\n")
    .trim() + "\n";

  await ctx.db.patch(item._id, {
    markdownPath: path,
    markdown,
    exportStatus: "pending",
    updatedAt: Date.now()
  });
}

async function ensureResourceMarkdown(ctx: any, resourceId: string) {
  const item = await ctx.db
    .query("resources")
    .withIndex("by_resource_id", (q: any) => q.eq("resourceId", resourceId))
    .unique();
  if (!item) return;

  const path = buildResourceMarkdownPath(item.updatedAt, item.resourceId);
  const markdown = [
    "---",
    `id: "${item.resourceId}"`,
    `resource_url: "${item.resourceUrl}"`,
    `resource_type: "${item.resourceType}"`,
    `tag: ${item.tagSlug ? JSON.stringify(item.tagSlug) : "null"}`,
    `company: ${item.company ? JSON.stringify(item.company) : "null"}`,
    `creator: ${item.creator ? JSON.stringify(item.creator) : "null"}`,
    `use_cases: ${JSON.stringify(item.useCases)}`,
    `source_capture_ids: ${JSON.stringify(item.sourceCaptureIds)}`,
    "---",
    "",
    `# ${item.name}`,
    "",
    `Resource URL: ${item.resourceUrl}`,
    "",
    item.details
  ]
    .join("\n")
    .trim() + "\n";

  await ctx.db.patch(item._id, {
    markdownPath: path,
    markdown,
    exportStatus: "pending",
    updatedAt: Date.now()
  });
}

function pickExcerptFromCapture(rawPayload: unknown): string | undefined {
  const xText = readString((rawPayload as any)?.quoted_tweet?.text) ?? readString((rawPayload as any)?.x?.data?.note_tweet?.text);
  return xText?.slice(0, 240);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function buildResourceMarkdownPath(timestamp: number, resourceId: string): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `resources/${year}/${month}/${day}/resource-${resourceId}.md`;
}

function compactPatch<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function readHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}
