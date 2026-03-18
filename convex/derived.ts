import { v } from "convex/values";
import { authComponent } from "./auth";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { buildActivityPreview, getActivityAuthor, getActivityPostedAt, getActivitySourcedAt, getActivitySyncBatchAt } from "./lib/activity";
import {
  buildDerivedEvaluation,
  extractDocumentBody,
  normalizeResourceKey,
  normalizeSkillKey,
  normalizeTaskKey,
  slugifyTag
} from "./lib/derived";
import { deterministicMarkdownPath } from "./lib/normalize";

const reviewStatusValidator = v.union(v.literal("pending_review"), v.literal("approved"), v.literal("rejected"));
const entityTypeValidator = v.union(
  v.literal("tag_assignment"),
  v.literal("note"),
  v.literal("task_candidate"),
  v.literal("skill_candidate"),
  v.literal("resource"),
  v.literal("author_rating")
);
const migrationKey = "notes-v1";
const internalApi = internal as any;

type BatchCaptureCandidate = {
  author?: string;
  canonicalUrl: string;
  captureId: string;
  createdAt: number;
  extractionStatus: string;
  ownerAuthUserId: string;
  titleHint?: string;
};

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
      const bundle = await buildDerivedEvaluation({
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
        status: "completed",
        details: {
          captureAssessment: bundle.captureAssessment,
          validationLog: bundle.validationLog
        }
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

export const listEligibleCapturesForBatch = internalQuery({
  args: {
    limit: v.optional(v.number()),
    scanLimit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    const scanLimit = Math.max(limit, Math.min(args.scanLimit ?? limit * 6, 500));
    const captures = await ctx.db.query("captures").withIndex("by_created_at").order("desc").take(scanLimit);
    const selected: BatchCaptureCandidate[] = [];

    for (const capture of captures) {
      if (!capture.ownerAuthUserId) continue;
      if (capture.extractionStatus !== "enriched" && capture.extractionStatus !== "partial") continue;
      const document = await ctx.db
        .query("markdownDocuments")
        .withIndex("by_capture_id", (q) => q.eq("captureId", capture.captureId))
        .unique();
      if (!document?.markdown) continue;

      selected.push({
        author: capture.author,
        canonicalUrl: capture.canonicalUrl,
        captureId: capture.captureId,
        createdAt: capture.createdAt,
        extractionStatus: capture.extractionStatus,
        ownerAuthUserId: capture.ownerAuthUserId,
        titleHint: capture.titleHint
      });

      if (selected.length >= limit) break;
    }

    return selected;
  }
});

export const getDerivedDebugSnapshot = internalQuery({
  args: {
    recentRuns: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const recentRunsLimit = Math.max(1, Math.min(args.recentRuns ?? 20, 100));
    const [authorRatings, notes, processingRuns, resources, skillCandidates, tagAssignments, taskCandidates] = await Promise.all([
      ctx.db.query("authorRatings").collect(),
      ctx.db.query("notes").collect(),
      ctx.db.query("processingRuns").collect(),
      ctx.db.query("resources").collect(),
      ctx.db.query("skillCandidates").collect(),
      ctx.db.query("tagAssignments").collect(),
      ctx.db.query("taskCandidates").collect()
    ]);

    return {
      counts: {
        authorRatings: authorRatings.length,
        notes: notes.length,
        processingRuns: processingRuns.length,
        resources: resources.length,
        skillCandidates: skillCandidates.length,
        tagAssignments: tagAssignments.length,
        taskCandidates: taskCandidates.length
      },
      recentRuns: processingRuns
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, recentRunsLimit)
        .map((run) => ({
          captureId: run.captureId,
          createdAt: run.createdAt,
          details: run.details,
          error: run.error,
          runId: run.runId,
          status: run.status
        }))
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
    details: v.optional(v.any()),
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
      details: args.details,
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
      const tagRecord =
        tag.role === "primary" && primaryTag
          ? primaryTag
          : await upsertTag(ctx, {
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
        why: tag.why,
        justification: tag.why,
        createdAt: now,
        updatedAt: now
      });
      await incrementTagUsage(ctx, tagRecord.tagId);
    }

    for (const item of args.bundle.notes ?? []) {
      const existing = await findMergeableNote(ctx, args.ownerAuthUserId, item.title);
      const sourceQuote = item.sourceQuote ?? pickExcerptFromCapture(capture.rawPayload) ?? undefined;
      if (existing) {
        await ctx.db.patch(existing._id, {
          sourceCaptureIds: uniqueStrings([...existing.sourceCaptureIds, args.captureId]),
          sourceQuote: existing.sourceQuote ?? sourceQuote,
          updatedAt: now,
          why: existing.why ?? item.why,
          justification: existing.justification ?? item.why
        });
        await ensureNoteSource(ctx, existing.noteId, args.captureId, sourceQuote, item.content);
      } else {
        const noteId = `note_${crypto.randomUUID()}`;
        await ctx.db.insert("notes", {
          noteId,
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
          why: item.why,
          exportStatus: undefined,
          createdAt: now,
          updatedAt: now
        });
        await ensureNoteSource(ctx, noteId, args.captureId, sourceQuote, item.content);
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
          updatedAt: now,
          why: existing.why ?? item.why,
          justification: existing.justification ?? item.why
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
          triggerContext: item.triggerContext,
          dedupeKey,
          reviewStatus: "pending_review",
          confidence: item.confidence,
          why: item.why,
          justification: item.why,
          createdAt: now,
          updatedAt: now
        });
      }
    }

    const skillCandidate = args.bundle.skillCandidate;
    if (skillCandidate) {
      const dedupeKey = normalizeSkillKey({
        mode: skillCandidate.mode,
        targetSystem: skillCandidate.targetSystem,
        targetSkillRef: skillCandidate.targetSkillRef,
        tagSlug: primaryTag?.slug,
        title: skillCandidate.title
      });
      const existing = await ctx.db
        .query("skillCandidates")
        .withIndex("by_owner_dedupe_key", (q) => q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("dedupeKey", dedupeKey))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          sourceCaptureIds: uniqueStrings([...existing.sourceCaptureIds, args.captureId]),
          updatedAt: now,
          why: existing.why ?? skillCandidate.why,
          justification: existing.justification ?? skillCandidate.why
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
          title: skillCandidate.title,
          details: skillCandidate.details,
          mode: skillCandidate.mode,
          targetSystem: skillCandidate.targetSystem,
          targetSkillRef: skillCandidate.targetSkillRef,
          proposedChange: skillCandidate.proposedChange,
          dedupeKey,
          reviewStatus: "pending_review",
          confidence: skillCandidate.confidence,
          why: skillCandidate.why,
          justification: skillCandidate.why,
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
          updatedAt: now,
          why: existing.why ?? item.why,
          justification: existing.justification ?? item.why
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
          why: item.why,
          justification: item.why,
          createdAt: now,
          updatedAt: now
        });
      }
    }

    const authorProfile = await upsertAuthorProfile(ctx, {
      ownerAuthUserId: args.ownerAuthUserId,
      capture
    });

    if (args.bundle.authorRating) {
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
        why: args.bundle.authorRating.why,
        justification: args.bundle.authorRating.why,
        createdAt: now,
        updatedAt: now
      });
    }

    return { ok: true };
  }
});

export const getNotesMigrationStatus = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const ownerAuthUserId = user._id;
    const record = await ctx.db
      .query("bitMigrations")
      .withIndex("by_owner_migration_key", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("migrationKey", migrationKey))
      .unique();

    const [legacyKnowledge, legacyViewpoints] = await Promise.all([
      ctx.db
        .query("knowledgeItems")
        .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "approved"))
        .take(200),
      ctx.db
        .query("sourceViewpoints")
        .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "approved"))
        .take(200)
    ]);

    const pendingLegacyKnowledge = await countPendingLegacyNotes(ctx, ownerAuthUserId, legacyKnowledge.map((item) => `knowledge_item:${item.knowledgeItemId}`));
    const pendingLegacyViewpoints = await countPendingLegacyNotes(
      ctx,
      ownerAuthUserId,
      legacyViewpoints.map((item) => `source_viewpoint:${item.sourceViewpointId}`)
    );

    return {
      details: record?.details ?? null,
      migratedAt: record?.migratedAt ?? null,
      needsMigration: pendingLegacyKnowledge + pendingLegacyViewpoints > 0,
      pendingLegacyKnowledge,
      pendingLegacyViewpoints,
      status: record?.status ?? "pending"
    };
  }
});

export const bootstrapNotesMigration = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const ownerAuthUserId = user._id;
    const now = Date.now();

    const existingRecord = await ctx.db
      .query("bitMigrations")
      .withIndex("by_owner_migration_key", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("migrationKey", migrationKey))
      .unique();

    let migrationRecordId = existingRecord?._id;
    if (!migrationRecordId) {
      migrationRecordId = await ctx.db.insert("bitMigrations", {
        ownerAuthUserId,
        migrationKey,
        status: "pending",
        createdAt: now,
        updatedAt: now
      });
    }

    const noteIdByLegacyKey = new Map<string, string>();
    const migratedCounts = {
      feedbackRowsRewritten: 0,
      knowledgeItems: 0,
      noteSources: 0,
      viewpoints: 0
    };

    const legacyKnowledge = await collectLegacyKnowledgeItems(ctx, ownerAuthUserId);
    for (const item of legacyKnowledge) {
      const legacyKey = `knowledge_item:${item.knowledgeItemId}`;
      const existingNote = await ctx.db
        .query("notes")
        .withIndex("by_owner_legacy_source_key", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("legacySourceKey", legacyKey))
        .unique();

      let noteId = existingNote?.noteId;
      if (!existingNote) {
        noteId = `note_${crypto.randomUUID()}`;
        await ctx.db.insert("notes", {
          noteId,
          ownerAuthUserId,
          primaryCaptureId: item.primaryCaptureId,
          sourceCaptureIds: item.sourceCaptureIds,
          sourceAuthor: item.sourceAuthor,
          canonicalUrl: item.canonicalUrl,
          tagSlug: item.tagSlug,
          title: item.title,
          content: item.content,
          sourceQuote: item.sourceQuote,
          reviewStatus: item.reviewStatus,
          confidence: item.confidence,
          why: item.why ?? item.justification,
          markdownPath: item.markdownPath,
          markdown: item.markdown,
          exportStatus: item.exportStatus,
          legacySourceKey: legacyKey,
          createdAt: item.createdAt,
          updatedAt: now,
          approvedAt: item.approvedAt
        });
        migratedCounts.knowledgeItems += 1;
      }

      if (!noteId) continue;
      noteIdByLegacyKey.set(legacyKey, noteId);
      const sources = await ctx.db
        .query("knowledgeItemSources")
        .withIndex("by_knowledge_item", (q) => q.eq("knowledgeItemId", item.knowledgeItemId))
        .collect();

      for (const source of sources) {
        const existingSource = await ctx.db
          .query("noteSources")
          .withIndex("by_note", (q) => q.eq("noteId", noteId))
          .filter((q) => q.eq(q.field("captureId"), source.captureId))
          .first();
        if (existingSource) continue;
        await ctx.db.insert("noteSources", {
          noteId,
          captureId: source.captureId,
          quote: source.quote,
          excerpt: source.excerpt,
          createdAt: source.createdAt
        });
        migratedCounts.noteSources += 1;
      }

      if (item.reviewStatus === "approved" && !item.markdownPath) {
        await ensureNoteMarkdown(ctx, noteId);
      }
    }

    const legacyViewpoints = await collectLegacyViewpoints(ctx, ownerAuthUserId);
    for (const item of legacyViewpoints) {
      const legacyKey = `source_viewpoint:${item.sourceViewpointId}`;
      const existingNote = await ctx.db
        .query("notes")
        .withIndex("by_owner_legacy_source_key", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("legacySourceKey", legacyKey))
        .unique();

      let noteId = existingNote?.noteId;
      if (!existingNote) {
        noteId = `note_${crypto.randomUUID()}`;
        const content = [item.claim, item.rationale].filter(Boolean).join("\n\n");
        await ctx.db.insert("notes", {
          noteId,
          ownerAuthUserId,
          primaryCaptureId: item.captureId,
          sourceCaptureIds: [item.captureId],
          sourceAuthor: item.sourceAuthor,
          canonicalUrl: item.canonicalUrl,
          tagSlug: slugifyTag(item.topic),
          title: buildViewpointNoteTitle(item),
          content,
          sourceQuote: item.evidenceQuote,
          reviewStatus: item.reviewStatus,
          confidence: item.confidence,
          why: item.why ?? item.justification ?? "Keeps a source-backed note that can coexist with other notes, even when they disagree.",
          legacySourceKey: legacyKey,
          createdAt: item.createdAt,
          updatedAt: now,
          approvedAt: item.reviewStatus === "approved" ? item.reviewedAt : undefined,
          exportStatus: undefined
        });
        await ensureNoteSource(ctx, noteId, item.captureId, item.evidenceQuote, content);
        migratedCounts.viewpoints += 1;
      }

      if (!noteId) continue;
      noteIdByLegacyKey.set(legacyKey, noteId);
    }

    const feedbackRows = await ctx.db.query("reviewFeedback").collect();
    for (const row of feedbackRows) {
      if (row.ownerAuthUserId !== ownerAuthUserId) continue;
      if (row.entityType !== "knowledge_item" && row.entityType !== "source_viewpoint") continue;
      const noteId = noteIdByLegacyKey.get(`${row.entityType}:${row.entityId}`);
      if (!noteId) continue;

      await ctx.db.patch(row._id, {
        entityType: "note",
        entityId: noteId,
        legacyEntityType: row.legacyEntityType ?? row.entityType,
        legacyEntityId: row.legacyEntityId ?? row.entityId
      });
      migratedCounts.feedbackRowsRewritten += 1;
    }

    await ctx.db.patch(migrationRecordId, {
      status: "completed",
      migratedAt: now,
      details: migratedCounts,
      updatedAt: now
    });

    return {
      ok: true,
      ...migratedCounts
    };
  }
});

export const purgeDerivedOutputs = internalMutation({
  args: {
    captureIds: v.optional(v.array(v.string())),
    includeProcessingRuns: v.optional(v.boolean()),
    includeReviewFeedback: v.optional(v.boolean())
  },
  handler: async (ctx, args) => {
    const captureIds = args.captureIds?.length ? new Set(args.captureIds) : null;
    const includeProcessingRuns = args.includeProcessingRuns ?? false;
    const includeReviewFeedback = args.includeReviewFeedback ?? false;
    const deletedEntityIds = new Set<string>();
    const counts = {
      authorRatings: 0,
      knowledgeItemSources: 0,
      knowledgeItems: 0,
      noteSources: 0,
      notes: 0,
      processingRuns: 0,
      resources: 0,
      reviewFeedback: 0,
      skillCandidates: 0,
      sourceViewpoints: 0,
      tagAssignments: 0,
      taskCandidates: 0,
      tagsReset: 0
    };

    const matchesCapture = (captureId: string | undefined) => !captureIds || (captureId ? captureIds.has(captureId) : false);

    const noteRows = await ctx.db.query("notes").collect();
    const noteIds = new Set(noteRows.filter((row) => matchesCapture(row.primaryCaptureId)).map((row) => row.noteId));
    const noteSources = await ctx.db.query("noteSources").collect();
    for (const row of noteSources) {
      if (!noteIds.has(row.noteId)) continue;
      await ctx.db.delete(row._id);
      counts.noteSources += 1;
    }
    for (const row of noteRows) {
      if (!noteIds.has(row.noteId)) continue;
      deletedEntityIds.add(row.noteId);
      await ctx.db.delete(row._id);
      counts.notes += 1;
    }

    const knowledgeRows = await ctx.db.query("knowledgeItems").collect();
    const knowledgeIds = new Set(knowledgeRows.filter((row) => matchesCapture(row.primaryCaptureId)).map((row) => row.knowledgeItemId));
    const knowledgeSources = await ctx.db.query("knowledgeItemSources").collect();
    for (const row of knowledgeSources) {
      if (!knowledgeIds.has(row.knowledgeItemId)) continue;
      await ctx.db.delete(row._id);
      counts.knowledgeItemSources += 1;
    }
    for (const row of knowledgeRows) {
      if (!knowledgeIds.has(row.knowledgeItemId)) continue;
      deletedEntityIds.add(row.knowledgeItemId);
      await ctx.db.delete(row._id);
      counts.knowledgeItems += 1;
    }

    const tagAssignments = await ctx.db.query("tagAssignments").collect();
    for (const row of tagAssignments) {
      if (!matchesCapture(row.captureId)) continue;
      deletedEntityIds.add(row.assignmentId);
      await ctx.db.delete(row._id);
      counts.tagAssignments += 1;
    }

    const tasks = await ctx.db.query("taskCandidates").collect();
    for (const row of tasks) {
      if (!matchesCapture(row.primaryCaptureId)) continue;
      deletedEntityIds.add(row.taskCandidateId);
      await ctx.db.delete(row._id);
      counts.taskCandidates += 1;
    }

    const skills = await ctx.db.query("skillCandidates").collect();
    for (const row of skills) {
      if (!matchesCapture(row.primaryCaptureId)) continue;
      deletedEntityIds.add(row.skillCandidateId);
      await ctx.db.delete(row._id);
      counts.skillCandidates += 1;
    }

    const resources = await ctx.db.query("resources").collect();
    for (const row of resources) {
      if (!matchesCapture(row.primaryCaptureId)) continue;
      deletedEntityIds.add(row.resourceId);
      await ctx.db.delete(row._id);
      counts.resources += 1;
    }

    const ratings = await ctx.db.query("authorRatings").collect();
    for (const row of ratings) {
      if (!matchesCapture(row.captureId)) continue;
      deletedEntityIds.add(row.authorRatingId);
      await ctx.db.delete(row._id);
      counts.authorRatings += 1;
    }

    const viewpoints = await ctx.db.query("sourceViewpoints").collect();
    for (const row of viewpoints) {
      if (!matchesCapture(row.captureId)) continue;
      deletedEntityIds.add(row.sourceViewpointId);
      await ctx.db.delete(row._id);
      counts.sourceViewpoints += 1;
    }

    if (includeReviewFeedback) {
      const feedbackRows = await ctx.db.query("reviewFeedback").collect();
      for (const row of feedbackRows) {
        if (captureIds && !deletedEntityIds.has(row.entityId)) continue;
        await ctx.db.delete(row._id);
        counts.reviewFeedback += 1;
      }
    }

    if (includeProcessingRuns) {
      const runs = await ctx.db.query("processingRuns").collect();
      for (const row of runs) {
        if (!matchesCapture(row.captureId)) continue;
        await ctx.db.delete(row._id);
        counts.processingRuns += 1;
      }
    }

    if (!captureIds) {
      const tags = await ctx.db.query("tags").collect();
      for (const row of tags) {
        if (row.usageCount === 0) continue;
        await ctx.db.patch(row._id, {
          usageCount: 0,
          updatedAt: Date.now()
        });
        counts.tagsReset += 1;
      }
    }

    return {
      captureScope: captureIds ? captureIds.size : "all",
      counts,
      deletedEntityCount: deletedEntityIds.size,
      includeProcessingRuns,
      includeReviewFeedback
    };
  }
});

export const processCaptureBatch = internalAction({
  args: {
    captureIds: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
    scanLimit: v.optional(v.number())
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    attempted: number;
    failed: number;
    succeeded: number;
    results: Array<BatchCaptureCandidate & { error?: string; ok: boolean; result?: unknown }>;
  }> => {
    let captures: BatchCaptureCandidate[];

    if (args.captureIds?.length) {
      const items: Array<BatchCaptureCandidate | null> = await Promise.all(
        args.captureIds.map(async (captureId) => {
          const input = await ctx.runQuery(internalApi.derived.getCaptureForEvaluation, { captureId });
          if (!input?.capture?.ownerAuthUserId) {
            return null;
          }
          return {
            author: input.capture.author,
            canonicalUrl: input.capture.canonicalUrl,
            captureId,
            createdAt: input.capture.createdAt,
            extractionStatus: input.capture.extractionStatus,
            ownerAuthUserId: input.capture.ownerAuthUserId,
            titleHint: input.capture.titleHint
          };
        })
      );
      captures = items.filter((item): item is BatchCaptureCandidate => Boolean(item));
    } else {
      captures = (await ctx.runQuery(internalApi.derived.listEligibleCapturesForBatch, {
        limit: args.limit,
        scanLimit: args.scanLimit
      })) as BatchCaptureCandidate[];
    }

    const results: Array<BatchCaptureCandidate & { error?: string; ok: boolean; result?: unknown }> = [];
    for (const capture of captures) {
      try {
        const result = await ctx.runAction(internalApi.derived.processCapture, {
          captureId: capture.captureId
        });
        results.push({
          ...capture,
          ok: true,
          result
        });
      } catch (error) {
        results.push({
          ...capture,
          error: error instanceof Error ? error.message : "Unknown processing error",
          ok: false
        });
      }
    }

    return {
      attempted: captures.length,
      failed: results.filter((item) => !item.ok).length,
      succeeded: results.filter((item) => item.ok).length,
      results
    };
  }
});

export const getDerivedSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const ownerAuthUserId = user._id;
    const [pendingTags, pendingTasks, approvedTasks, approvedNotes, approvedResources, pendingNotes, pendingSkills, pendingResources, pendingRatings, topTags, profiles] =
      await Promise.all([
        ctx.db
          .query("tagAssignments")
          .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
          .take(100),
        ctx.db
          .query("taskCandidates")
          .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
          .take(100),
        ctx.db
          .query("taskCandidates")
          .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "approved"))
          .take(100),
        ctx.db
          .query("notes")
          .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "approved"))
          .take(100),
        ctx.db
          .query("resources")
          .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "approved"))
          .take(100),
        ctx.db
          .query("notes")
          .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
          .take(100),
        ctx.db
          .query("skillCandidates")
          .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
          .take(100),
        ctx.db
          .query("resources")
          .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
          .take(100),
        ctx.db
          .query("authorRatings")
          .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
          .take(100),
        ctx.db.query("tags").withIndex("by_owner_usage", (q) => q.eq("ownerAuthUserId", ownerAuthUserId)).take(12),
        ctx.db.query("authorProfiles").withIndex("by_owner_author_key", (q) => q.eq("ownerAuthUserId", ownerAuthUserId)).take(50)
      ]);

    return {
      candidateCounts: {
        authorRatingsPending: pendingRatings.length,
        notesPending: pendingNotes.length,
        resourcesPending: pendingResources.length,
        skillsPending: pendingSkills.length,
        tagsPending: pendingTags.length,
        tasksPending: pendingTasks.length
      },
      approvedNoteCount: approvedNotes.length,
      approvedResourceCount: approvedResources.length,
      approvedTaskCount: approvedTasks.length,
      authorSummaries: profiles.slice(0, 8).map((profile) => ({
        authorKey: profile.authorKey,
        currentTier: profile.currentTier ?? "Unrated",
        displayName: profile.displayName,
        hypeScore: profile.hypeScore ?? null,
        relevanceScore: profile.relevanceScore ?? null,
        signalScore: profile.signalScore ?? null,
        trustScore: profile.trustScore ?? null
      })),
      topTags: [...topTags]
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 8)
        .map((tag) => ({
          name: tag.name,
          slug: tag.slug,
          tagId: tag.tagId,
          usageCount: tag.usageCount
        }))
    };
  }
});

export const getHasPendingReview = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const ownerAuthUserId = user._id;
    const [pendingTag, pendingTask, pendingNote, pendingSkill, pendingResource, pendingRating] = await Promise.all([
      ctx.db
        .query("tagAssignments")
        .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
        .take(1),
      ctx.db
        .query("taskCandidates")
        .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
        .take(1),
      ctx.db
        .query("notes")
        .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
        .take(1),
      ctx.db
        .query("skillCandidates")
        .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
        .take(1),
      ctx.db
        .query("resources")
        .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
        .take(1),
      ctx.db
        .query("authorRatings")
        .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
        .take(1)
    ]);

    return {
      hasPendingReview: Boolean(
        pendingTag.length || pendingTask.length || pendingNote.length || pendingSkill.length || pendingResource.length || pendingRating.length
      )
    };
  }
});

export const getReviewQueue = query({
  args: {
    captureId: v.optional(v.string()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const ownerAuthUserId = user._id;
    const limit = Math.min(args.limit ?? 12, 24);
    const captureScanLimit = Math.min(Math.max(limit * 4, 24), 48);
    const captures = args.captureId
      ? await loadSingleReviewCapture(ctx, ownerAuthUserId, args.captureId)
      : await ctx.db
          .query("captures")
          .withIndex("by_owner_created_at", (q) => q.eq("ownerAuthUserId", ownerAuthUserId))
          .order("desc")
          .take(captureScanLimit);

    const queue: any[] = [];

    for (const capture of captures) {
      const queueItem = await buildReviewQueueItem(ctx, ownerAuthUserId, capture);
      if (!queueItem) continue;

      queue.push(queueItem);

      if (queue.length >= limit) break;
    }

    return { items: queue };
  }
});

async function loadSingleReviewCapture(ctx: any, ownerAuthUserId: string, captureId: string) {
  const capture = await ctx.db
    .query("captures")
    .withIndex("by_capture_id", (q: any) => q.eq("captureId", captureId))
    .unique();

  if (!capture || capture.ownerAuthUserId !== ownerAuthUserId) {
    return [];
  }

  return [capture];
}

async function buildReviewQueueItem(ctx: any, ownerAuthUserId: string, capture: any) {
  const entityRows = await getCaptureEntityRows(ctx, ownerAuthUserId, capture.captureId);
  const pendingEntities = entityRows.filter((item) => item.reviewStatus === "pending_review");
  if (pendingEntities.length === 0) return null;

  const feedbackByEntity = await loadFeedbackForEntities(ctx, ownerAuthUserId, pendingEntities);
  const preview = buildActivityPreview(capture);
  const decorated = decoratePendingEntities(pendingEntities, feedbackByEntity);
  const statusCounts = {
    approved: entityRows.filter((item) => item.reviewStatus === "approved").length,
    pending: pendingEntities.length,
    rejected: entityRows.filter((item) => item.reviewStatus === "rejected").length,
    saved: decorated.filter((item) => item.payload.feedbackHistory.length > 0).length
  };

  return {
    authorRatings: decorated.filter((item) => item.entityType === "author_rating").map((item) => item.payload),
    capture: {
      author: getActivityAuthor(capture),
      canonicalUrl: capture.canonicalUrl,
      captureMethod: capture.captureMethod,
      id: capture.captureId,
      platform: capture.platform,
      postedAt: getActivityPostedAt(capture),
      sourcedAt: getActivitySourcedAt(capture),
      status: capture.extractionStatus,
      syncBatchAt: getActivitySyncBatchAt(capture),
      title: preview.title,
      xPost: preview.xPost
    },
    notes: decorated.filter((item) => item.entityType === "note").map((item) => item.payload),
    pendingCount: pendingEntities.length,
    resources: decorated.filter((item) => item.entityType === "resource").map((item) => item.payload),
    skillCandidates: decorated.filter((item) => item.entityType === "skill_candidate").map((item) => item.payload),
    statusCounts,
    tags: decorated.filter((item) => item.entityType === "tag_assignment").map((item) => item.payload),
    taskCandidates: decorated.filter((item) => item.entityType === "task_candidate").map((item) => item.payload)
  };
}

export const listTasks = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const limit = Math.min(args.limit ?? 50, 200);
    const rows = await ctx.db
      .query("taskCandidates")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "approved"))
      .take(limit);
    return rows.sort((a, b) => b.updatedAt - a.updatedAt).map((item) => ({
      ...item,
      sourceCaptureCount: item.sourceCaptureIds.length,
      sourceUrl: item.canonicalUrl,
      why: item.why ?? item.justification ?? ""
    }));
  }
});

export const listNotes = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const limit = Math.min(args.limit ?? 50, 200);
    const rows = await ctx.db
      .query("notes")
      .withIndex("by_owner_review_status", (q) => q.eq("ownerAuthUserId", user._id).eq("reviewStatus", "approved"))
      .take(limit);
    return rows.sort((a, b) => b.updatedAt - a.updatedAt).map((item) => ({
      ...item,
      sourceCaptureCount: item.sourceCaptureIds.length,
      sourceUrl: item.canonicalUrl,
      why: item.why ?? ""
    }));
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
    return rows.sort((a, b) => b.updatedAt - a.updatedAt).map((item) => ({
      ...item,
      mode: item.mode ?? "delta",
      sourceCaptureCount: item.sourceCaptureIds.length,
      sourceUrl: item.canonicalUrl,
      why: item.why ?? item.justification ?? ""
    }));
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
      sourceUrl: item.sourceCanonicalUrl,
      why: item.why ?? item.justification ?? ""
    }));
  }
});

export const listPendingNoteMarkdownForOwner = query({
  args: { ownerAuthUserId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 300);
    return await ctx.db
      .query("notes")
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

export const markNoteMarkdownExported = mutation({
  args: { noteId: v.string() },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("notes")
      .withIndex("by_note_id", (q) => q.eq("noteId", args.noteId))
      .unique();
    if (!item) throw new Error("Note not found");
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
    action: v.union(v.literal("approve"), v.literal("reject"), v.literal("save"), v.literal("comment")),
    comment: v.optional(v.string()),
    updates: v.optional(v.any())
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
    const patch =
      args.action === "comment"
        ? {}
        : compactPatch(await buildReviewPatch(args.entityType, args.action, args.updates ?? {}, now, ownerAuthUserId, ctx));
    const changedFields = args.action === "comment" ? [] : diffChangedFields(target, patch);

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(target._id, patch);
    }

    if (args.entityType === "author_rating" && (args.action === "approve" || args.action === "save")) {
      await applyAuthorProfileUpdateFromRating(ctx, target.authorKey, ownerAuthUserId, {
        currentTier: patch.suggestedTier ?? target.suggestedTier,
        trustScore: patch.trustScore ?? target.trustScore,
        signalScore: patch.signalScore ?? target.signalScore,
        hypeScore: patch.hypeScore ?? target.hypeScore,
        relevanceScore: patch.relevanceScore ?? target.relevanceScore
      });
    }

    if (args.entityType === "note" && (args.action === "approve" || (args.action === "save" && patch.reviewStatus === "approved"))) {
      await ensureNoteMarkdown(ctx, args.entityId);
    }
    if (args.entityType === "resource" && (args.action === "approve" || (args.action === "save" && patch.reviewStatus === "approved"))) {
      await ensureResourceMarkdown(ctx, args.entityId);
    }

    const legacyRef = parseLegacyEntityKey(target.legacySourceKey);
    const feedbackId = `feedback_${crypto.randomUUID()}`;
    await ctx.db.insert("reviewFeedback", {
      feedbackId,
      ownerAuthUserId,
      entityType: args.entityType,
      entityId: args.entityId,
      action: args.action,
      before,
      after: patch,
      changedFields,
      comment: args.comment,
      legacyEntityType: legacyRef?.legacyEntityType,
      legacyEntityId: legacyRef?.legacyEntityId,
      createdAt: now
    });

    return {
      changedFields,
      feedbackId,
      reviewStatus: patch.reviewStatus ?? target.reviewStatus,
      savedAt: now
    };
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

  await deleteByPrimaryCapture(ctx, "notes", ownerAuthUserId, captureId);
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
}

async function deleteByPrimaryCapture(
  ctx: any,
  table: "notes" | "taskCandidates" | "skillCandidates" | "resources",
  ownerAuthUserId: string,
  captureId: string
) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_owner_primary_capture", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", captureId))
    .filter((q: any) => q.eq(q.field("reviewStatus"), "pending_review"))
    .collect();
  for (const row of rows) {
    if (table === "notes") {
      const sources = await ctx.db.query("noteSources").withIndex("by_note", (q: any) => q.eq("noteId", row.noteId)).collect();
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

async function findMergeableNote(ctx: any, ownerAuthUserId: string, title: string) {
  const targetSlug = slugifyTag(title);
  const [pending, approved] = await Promise.all([
    ctx.db
      .query("notes")
      .withIndex("by_owner_review_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
      .take(100),
    ctx.db
      .query("notes")
      .withIndex("by_owner_review_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "approved"))
      .take(100)
  ]);
  return [...pending, ...approved].find((item: any) => slugifyTag(item.title) === targetSlug);
}

async function ensureNoteSource(ctx: any, noteId: string, captureId: string, quote: string | undefined, excerpt: string) {
  const existing = await ctx.db
    .query("noteSources")
    .withIndex("by_note", (q: any) => q.eq("noteId", noteId))
    .filter((q: any) => q.eq(q.field("captureId"), captureId))
    .first();
  if (existing) return;
  await ctx.db.insert("noteSources", {
    noteId,
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

async function getCaptureEntityRows(ctx: any, ownerAuthUserId: string, captureId: string) {
  const [tags, notes, tasks, skills, resources, authorRatingsApproved, authorRatingsPending, authorRatingsRejected] = await Promise.all([
    ctx.db.query("tagAssignments").withIndex("by_capture", (q: any) => q.eq("captureId", captureId)).collect(),
    ctx.db.query("notes").withIndex("by_owner_primary_capture", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", captureId)).collect(),
    ctx.db.query("taskCandidates").withIndex("by_owner_primary_capture", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", captureId)).collect(),
    ctx.db.query("skillCandidates").withIndex("by_owner_primary_capture", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", captureId)).collect(),
    ctx.db.query("resources").withIndex("by_owner_primary_capture", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("primaryCaptureId", captureId)).collect(),
    ctx.db
      .query("authorRatings")
      .withIndex("by_owner_capture_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("captureId", captureId).eq("reviewStatus", "approved"))
      .collect(),
    ctx.db
      .query("authorRatings")
      .withIndex("by_owner_capture_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("captureId", captureId).eq("reviewStatus", "pending_review"))
      .collect(),
    ctx.db
      .query("authorRatings")
      .withIndex("by_owner_capture_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("captureId", captureId).eq("reviewStatus", "rejected"))
      .collect()
  ]);

  return [
    ...tags
      .filter((item: any) => item.ownerAuthUserId === ownerAuthUserId)
      .map((item: any) => ({ entityId: item.assignmentId, entityType: "tag_assignment" as const, reviewStatus: item.reviewStatus, row: item })),
    ...notes.map((item: any) => ({ entityId: item.noteId, entityType: "note" as const, reviewStatus: item.reviewStatus, row: item })),
    ...tasks.map((item: any) => ({ entityId: item.taskCandidateId, entityType: "task_candidate" as const, reviewStatus: item.reviewStatus, row: item })),
    ...skills.map((item: any) => ({ entityId: item.skillCandidateId, entityType: "skill_candidate" as const, reviewStatus: item.reviewStatus, row: item })),
    ...resources.map((item: any) => ({ entityId: item.resourceId, entityType: "resource" as const, reviewStatus: item.reviewStatus, row: item })),
    ...authorRatingsApproved.map((item: any) => ({ entityId: item.authorRatingId, entityType: "author_rating" as const, reviewStatus: item.reviewStatus, row: item })),
    ...authorRatingsPending.map((item: any) => ({ entityId: item.authorRatingId, entityType: "author_rating" as const, reviewStatus: item.reviewStatus, row: item })),
    ...authorRatingsRejected.map((item: any) => ({ entityId: item.authorRatingId, entityType: "author_rating" as const, reviewStatus: item.reviewStatus, row: item }))
  ];
}

async function loadFeedbackForEntities(
  ctx: any,
  ownerAuthUserId: string,
  entities: Array<{ entityId: string; entityType: string }>
) {
  const map = new Map<string, any[]>();

  for (const entity of entities) {
    const rows = await ctx.db
      .query("reviewFeedback")
      .withIndex("by_owner_entity", (q: any) =>
        q.eq("ownerAuthUserId", ownerAuthUserId).eq("entityType", entity.entityType).eq("entityId", entity.entityId)
      )
      .collect();
    map.set(
      `${entity.entityType}:${entity.entityId}`,
      rows
        .sort((left: any, right: any) => right.createdAt - left.createdAt)
        .map((row: any) => ({
          action: row.action,
          changedFields: row.changedFields ?? [],
          comment: row.comment ?? "",
          createdAt: row.createdAt,
          feedbackId: row.feedbackId
        }))
    );
  }

  return map;
}

function decoratePendingEntities(
  entities: Array<{ entityId: string; entityType: string; row: any }>,
  feedbackByEntity: Map<string, any[]>
) {
  return entities.map((entity) => {
    const feedbackHistory = feedbackByEntity.get(`${entity.entityType}:${entity.entityId}`) ?? [];
    const lastSavedAt = feedbackHistory[0]?.createdAt ?? null;
    return {
      entityType: entity.entityType,
      payload: {
        ...mapEntityForReview(entity.entityType, entity.row),
        feedbackHistory,
        lastSavedAt,
        reviewStatus: entity.row.reviewStatus
      }
    };
  });
}

function mapEntityForReview(entityType: string, row: any) {
  const shared = {
    confidence: row.confidence,
    id: row.assignmentId ?? row.noteId ?? row.taskCandidateId ?? row.skillCandidateId ?? row.resourceId ?? row.authorRatingId
  };

  switch (entityType) {
    case "tag_assignment":
      return {
        ...shared,
        name: row.tagName,
        role: row.role,
        why: row.why ?? row.justification ?? ""
      };
    case "note":
      return {
        ...shared,
        content: row.content,
        sourceQuote: row.sourceQuote ?? "",
        title: row.title,
        why: row.why ?? ""
      };
    case "task_candidate":
      return {
        ...shared,
        assigneeType: row.assigneeType,
        details: row.details,
        executionTarget: row.executionTarget ?? "",
        suggestedAction: row.suggestedAction ?? "",
        title: row.title,
        triggerContext: row.triggerContext ?? "",
        why: row.why ?? row.justification ?? ""
      };
    case "skill_candidate":
      return {
        ...shared,
        details: row.details,
        mode: row.mode ?? "delta",
        proposedChange: row.proposedChange,
        targetSkillRef: row.targetSkillRef ?? "",
        targetSystem: row.targetSystem,
        title: row.title,
        why: row.why ?? row.justification ?? ""
      };
    case "resource":
      return {
        ...shared,
        company: row.company ?? "",
        creator: row.creator ?? "",
        details: row.details,
        name: row.name,
        resourceType: row.resourceType,
        resourceUrl: row.resourceUrl,
        useCases: row.useCases,
        why: row.why ?? row.justification ?? ""
      };
    case "author_rating":
      return {
        ...shared,
        hypeScore: row.hypeScore,
        relevanceScore: row.relevanceScore,
        signalScore: row.signalScore,
        sourceAuthor: row.sourceAuthor,
        suggestedTier: row.suggestedTier,
        trustScore: row.trustScore,
        why: row.why ?? row.justification ?? ""
      };
    default:
      return shared;
  }
}

async function findEntity(ctx: any, entityType: string, entityId: string) {
  switch (entityType) {
    case "tag_assignment":
      return await ctx.db.query("tagAssignments").withIndex("by_assignment_id", (q: any) => q.eq("assignmentId", entityId)).unique();
    case "note":
      return await ctx.db.query("notes").withIndex("by_note_id", (q: any) => q.eq("noteId", entityId)).unique();
    case "task_candidate":
      return await ctx.db.query("taskCandidates").withIndex("by_task_candidate_id", (q: any) => q.eq("taskCandidateId", entityId)).unique();
    case "skill_candidate":
      return await ctx.db.query("skillCandidates").withIndex("by_skill_candidate_id", (q: any) => q.eq("skillCandidateId", entityId)).unique();
    case "resource":
      return await ctx.db.query("resources").withIndex("by_resource_id", (q: any) => q.eq("resourceId", entityId)).unique();
    case "author_rating":
      return await ctx.db.query("authorRatings").withIndex("by_author_rating_id", (q: any) => q.eq("authorRatingId", entityId)).unique();
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
        why: readString(updates.why) ?? undefined,
        justification: readString(updates.why) ?? undefined,
        reviewStatus: status,
        reviewedAt: status ? now : undefined,
        updatedAt: now
      };
    }
    case "note":
      return {
        title: readString(updates.title) ?? undefined,
        content: readString(updates.content) ?? undefined,
        sourceQuote: readString(updates.sourceQuote) ?? undefined,
        confidence: typeof updates.confidence === "number" ? updates.confidence : undefined,
        why: readString(updates.why) ?? undefined,
        markdown: undefined,
        markdownPath: undefined,
        reviewStatus: status,
        approvedAt: status === "approved" ? now : undefined,
        exportStatus: status === "approved" ? "pending" : undefined,
        updatedAt: now
      };
    case "task_candidate":
      return {
        assigneeType: updates.assigneeType === "agent" || updates.assigneeType === "user" ? updates.assigneeType : undefined,
        details: readString(updates.details) ?? undefined,
        executionTarget: readString(updates.executionTarget) ?? undefined,
        suggestedAction: readString(updates.suggestedAction) ?? undefined,
        title: readString(updates.title) ?? undefined,
        triggerContext: readString(updates.triggerContext) ?? undefined,
        why: readString(updates.why) ?? undefined,
        justification: readString(updates.why) ?? undefined,
        reviewStatus: status,
        approvedAt: status === "approved" ? now : undefined,
        updatedAt: now
      };
    case "skill_candidate":
      return {
        details: readString(updates.details) ?? undefined,
        mode: updates.mode === "draft" || updates.mode === "delta" ? updates.mode : undefined,
        proposedChange: readString(updates.proposedChange) ?? undefined,
        targetSkillRef: readString(updates.targetSkillRef) ?? undefined,
        targetSystem: readString(updates.targetSystem) ?? undefined,
        title: readString(updates.title) ?? undefined,
        why: readString(updates.why) ?? undefined,
        justification: readString(updates.why) ?? undefined,
        reviewStatus: status,
        approvedAt: status === "approved" ? now : undefined,
        updatedAt: now
      };
    case "resource": {
      const resourceUrl = readString(updates.resourceUrl);
      return {
        company: readString(updates.company) ?? undefined,
        creator: readString(updates.creator) ?? undefined,
        details: readString(updates.details) ?? undefined,
        name: readString(updates.name) ?? undefined,
        resourceType: readString(updates.resourceType) ?? undefined,
        resourceUrl: resourceUrl ?? undefined,
        resourceDomain: resourceUrl ? readHostname(resourceUrl) : undefined,
        useCases: Array.isArray(updates.useCases)
          ? updates.useCases.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
          : typeof updates.useCases === "string"
            ? updates.useCases.split(",").map((item: string) => item.trim()).filter(Boolean)
            : undefined,
        dedupeKey: resourceUrl ? normalizeResourceKey({ resourceUrl }) : undefined,
        why: readString(updates.why) ?? undefined,
        justification: readString(updates.why) ?? undefined,
        reviewStatus: status,
        approvedAt: status === "approved" ? now : undefined,
        exportStatus: status === "approved" ? "pending" : undefined,
        updatedAt: now
      };
    }
    case "author_rating":
      return {
        suggestedTier: readString(updates.suggestedTier) ?? undefined,
        trustScore: typeof updates.trustScore === "number" ? updates.trustScore : undefined,
        signalScore: typeof updates.signalScore === "number" ? updates.signalScore : undefined,
        hypeScore: typeof updates.hypeScore === "number" ? updates.hypeScore : undefined,
        relevanceScore: typeof updates.relevanceScore === "number" ? updates.relevanceScore : undefined,
        why: readString(updates.why) ?? undefined,
        justification: readString(updates.why) ?? undefined,
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
      return { role: target.role, tagName: target.tagName, why: target.why ?? target.justification };
    case "note":
      return { content: target.content, title: target.title, why: target.why };
    case "task_candidate":
      return { assigneeType: target.assigneeType, details: target.details, title: target.title, why: target.why ?? target.justification };
    case "skill_candidate":
      return { mode: target.mode, proposedChange: target.proposedChange, title: target.title, why: target.why ?? target.justification };
    case "resource":
      return { name: target.name, resourceType: target.resourceType, resourceUrl: target.resourceUrl, why: target.why ?? target.justification };
    case "author_rating":
      return {
        hypeScore: target.hypeScore,
        relevanceScore: target.relevanceScore,
        signalScore: target.signalScore,
        suggestedTier: target.suggestedTier,
        trustScore: target.trustScore,
        why: target.why ?? target.justification
      };
    default:
      return {};
  }
}

function diffChangedFields(target: any, patch: Record<string, unknown>) {
  return Object.entries(patch)
    .filter(([key]) => !["updatedAt", "reviewedAt", "approvedAt", "markdown", "markdownPath"].includes(key))
    .filter(([key, value]) => JSON.stringify(target[key]) !== JSON.stringify(value))
    .map(([key]) => key);
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

async function ensureNoteMarkdown(ctx: any, noteId: string) {
  const item = await ctx.db.query("notes").withIndex("by_note_id", (q: any) => q.eq("noteId", noteId)).unique();
  if (!item) return;
  const capture = await ctx.db
    .query("captures")
    .withIndex("by_capture_id", (q: any) => q.eq("captureId", item.primaryCaptureId))
    .unique();
  if (!capture) return;

  const path = deterministicMarkdownPath({
    capturedAt: capture.capturedAt,
    platform: "note",
    captureId: item.noteId
  });

  const markdown =
    [
      "---",
      `id: "${item.noteId}"`,
      `source_capture_ids: ${JSON.stringify(item.sourceCaptureIds)}`,
      `canonical_url: "${item.canonicalUrl}"`,
      `source_author: ${item.sourceAuthor ? JSON.stringify(item.sourceAuthor) : "null"}`,
      `tag: ${item.tagSlug ? JSON.stringify(item.tagSlug) : "null"}`,
      `why: ${item.why ? JSON.stringify(item.why) : "null"}`,
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
  const markdown =
    [
      "---",
      `id: "${item.resourceId}"`,
      `resource_url: "${item.resourceUrl}"`,
      `resource_type: "${item.resourceType}"`,
      `tag: ${item.tagSlug ? JSON.stringify(item.tagSlug) : "null"}`,
      `company: ${item.company ? JSON.stringify(item.company) : "null"}`,
      `creator: ${item.creator ? JSON.stringify(item.creator) : "null"}`,
      `use_cases: ${JSON.stringify(item.useCases)}`,
      `source_capture_ids: ${JSON.stringify(item.sourceCaptureIds)}`,
      `why: ${item.why ? JSON.stringify(item.why) : "null"}`,
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

async function collectLegacyKnowledgeItems(ctx: any, ownerAuthUserId: string) {
  const [approved, pending, rejected] = await Promise.all([
    ctx.db
      .query("knowledgeItems")
      .withIndex("by_owner_review_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "approved"))
      .take(200),
    ctx.db
      .query("knowledgeItems")
      .withIndex("by_owner_review_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
      .take(200),
    ctx.db
      .query("knowledgeItems")
      .withIndex("by_owner_review_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "rejected"))
      .take(200)
  ]);
  return [...approved, ...pending, ...rejected];
}

async function collectLegacyViewpoints(ctx: any, ownerAuthUserId: string) {
  const [approved, pending, rejected] = await Promise.all([
    ctx.db
      .query("sourceViewpoints")
      .withIndex("by_owner_review_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "approved"))
      .take(200),
    ctx.db
      .query("sourceViewpoints")
      .withIndex("by_owner_review_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "pending_review"))
      .take(200),
    ctx.db
      .query("sourceViewpoints")
      .withIndex("by_owner_review_status", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("reviewStatus", "rejected"))
      .take(200)
  ]);
  return [...approved, ...pending, ...rejected];
}

async function countPendingLegacyNotes(ctx: any, ownerAuthUserId: string, legacyKeys: string[]) {
  if (legacyKeys.length === 0) return 0;
  let count = 0;
  for (const legacyKey of legacyKeys) {
    const existing = await ctx.db
      .query("notes")
      .withIndex("by_owner_legacy_source_key", (q: any) => q.eq("ownerAuthUserId", ownerAuthUserId).eq("legacySourceKey", legacyKey))
      .unique();
    if (!existing) count += 1;
  }
  return count;
}

function buildViewpointNoteTitle(item: { claim: string; topic: string }) {
  const claim = readString(item.claim) ?? "Untitled note";
  return claim.length <= 96 ? claim : `${claim.slice(0, 93).trimEnd()}...`;
}

function parseLegacyEntityKey(value?: string | null) {
  if (!value || !value.includes(":")) return null;
  const [legacyEntityType, legacyEntityId] = value.split(":");
  return legacyEntityType && legacyEntityId ? { legacyEntityId, legacyEntityType } : null;
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
