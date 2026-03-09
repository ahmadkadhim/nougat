import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { createCaptureHash } from "./lib/hash";
import { renderMarkdownDocument } from "./lib/markdown";
import { captureBucket, detectPlatform, deterministicMarkdownPath, extractPlatformIds, normalizeUrl } from "./lib/normalize";

const captureRequestValidator = v.object({
  source_url: v.string(),
  captured_at: v.number(),
  capture_method: v.union(
    v.literal("single_tab"),
    v.literal("selected_tabs"),
    v.literal("window_tabs"),
    v.literal("all_tabs"),
    v.literal("share_sheet"),
    v.literal("manual"),
    v.literal("x_bookmark_sync")
  ),
  source_app: v.string(),
  author_hint: v.optional(v.string()),
  title_hint: v.optional(v.string()),
  selected_text: v.optional(v.string()),
  tab_context: v.optional(v.string()),
  platform_hint: v.optional(v.string()),
  source_metadata: v.optional(v.any()),
  idempotency_key: v.optional(v.string())
});

export const ingestCapture = mutation({
  args: {
    deviceId: v.string(),
    request: captureRequestValidator,
    ownerAuthUserId: v.optional(v.string()),
    rawPayload: v.optional(v.any())
  },
  handler: async (ctx, args) => {
    return await ingestOne(ctx, args.deviceId, args.request, args.rawPayload, args.ownerAuthUserId);
  }
});

export const ingestBulkCaptures = mutation({
  args: {
    deviceId: v.string(),
    requests: v.array(captureRequestValidator)
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const request of args.requests) {
      const result = await ingestOne(ctx, args.deviceId, request, request);
      results.push(result);
    }

    return {
      accepted: results.filter((r) => !r.deduped).length,
      deduped: results.filter((r) => r.deduped).length,
      results
    };
  }
});

export const ingestSystemCapture = internalMutation({
  args: {
    deviceId: v.string(),
    request: captureRequestValidator,
    ownerAuthUserId: v.optional(v.string()),
    rawPayload: v.optional(v.any())
  },
  handler: async (ctx, args) => {
    return await ingestOne(ctx, args.deviceId, args.request, args.rawPayload, args.ownerAuthUserId);
  }
});

async function ingestOne(
  ctx: any,
  deviceId: string,
  request: {
    source_url: string;
    captured_at: number;
    capture_method:
      | "single_tab"
      | "selected_tabs"
      | "window_tabs"
      | "all_tabs"
      | "share_sheet"
      | "manual"
      | "x_bookmark_sync";
    source_app: string;
    author_hint?: string;
    title_hint?: string;
    selected_text?: string;
    tab_context?: string;
    platform_hint?: string;
    source_metadata?: unknown;
    idempotency_key?: string;
  },
  rawPayload?: unknown,
  ownerAuthUserId?: string
) {
  const now = Date.now();
  const canonicalUrl = normalizeUrl(request.source_url);
  const platform = detectPlatform(canonicalUrl, request.platform_hint);
  const platformIds = extractPlatformIds(canonicalUrl, platform);
  const captureHash = await createCaptureHash({
    canonicalUrl,
    selectedText: request.selected_text,
    titleHint: request.title_hint
  });
  const bucket = captureBucket(request.captured_at);

  const existing = await ctx.db
    .query("captures")
    .withIndex("by_device_hash_bucket", (q: any) =>
      q.eq("deviceId", deviceId).eq("captureHash", captureHash).eq("capturedBucket", bucket)
    )
    .unique();

  if (existing) {
    await ctx.db.insert("duplicates", {
      duplicateId: `dup_${crypto.randomUUID()}`,
      captureId: `dup_capture_${crypto.randomUUID()}`,
      duplicateOfCaptureId: existing.captureId,
      reason: "idempotency_window_match",
      createdAt: now
    });

    return {
      capture_id: existing.captureId,
      deduped: true,
      extraction_status: existing.extractionStatus,
      canonical_url: existing.canonicalUrl
    };
  }

  const captureId = `cap_${crypto.randomUUID()}`;
  const jobId = `job_${crypto.randomUUID()}`;

  await ctx.db.insert("captures", {
    captureId,
    ownerAuthUserId,
    sourceUrl: request.source_url,
    canonicalUrl,
    platform,
    platformIds,
    author: request.author_hint,
    capturedAt: request.captured_at,
    capturedBucket: bucket,
    deviceId,
    captureMethod: request.capture_method,
    sourceApp: request.source_app,
    extractionStatus: "queued",
    confidence: 0,
    titleHint: request.title_hint,
    selectedText: request.selected_text,
    tabContext: request.tab_context,
    sourceMetadata: request.source_metadata,
    rawPayload,
    captureHash,
    idempotencyKey: request.idempotency_key,
    enrichmentAttempts: 0,
    createdAt: now,
    updatedAt: now
  });

  await ctx.db.insert("enrichmentJobs", {
    jobId,
    captureId,
    status: "queued",
    attempt: 0,
    maxAttempts: 3,
    scheduledAt: now,
    updatedAt: now
  });

  await ctx.scheduler.runAfter(0, internal.enrichment.processCapture, { captureId });

  return {
    capture_id: captureId,
    deduped: false,
    extraction_status: "queued",
    canonical_url: canonicalUrl
  };
}

export const getCaptureByCaptureId = query({
  args: { captureId: v.string() },
  handler: async (ctx, args) => {
    const capture = await ctx.db
      .query("captures")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .unique();
    if (!capture) return null;

    const job = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .first();

    const document = await ctx.db
      .query("markdownDocuments")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .first();

    return {
      capture,
      job,
      document
    };
  }
});

export const listNewCaptures = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);
    return await ctx.db.query("captures").withIndex("by_created_at").order("desc").take(limit);
  }
});

export const listFailedCaptures = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);
    const failed = await ctx.db
      .query("captures")
      .withIndex("by_status", (q) => q.eq("extractionStatus", "failed"))
      .take(limit);
    const dead = await ctx.db
      .query("captures")
      .withIndex("by_status", (q) => q.eq("extractionStatus", "dead_letter"))
      .take(limit);

    return [...failed, ...dead]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }
});

export const listDedupeConflicts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 50, 200);
    return await ctx.db.query("duplicates").order("desc").take(limit);
  }
});

export const listPendingMarkdown = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 300);
    return await ctx.db
      .query("markdownDocuments")
      .withIndex("by_export_status", (q) => q.eq("exportStatus", "pending"))
      .take(limit);
  }
});

export const markMarkdownExported = mutation({
  args: {
    documentId: v.string()
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("markdownDocuments")
      .withIndex("by_document_id", (q) => q.eq("documentId", args.documentId))
      .unique();

    if (!doc) throw new Error("Document not found");

    const now = Date.now();
    await ctx.db.patch(doc._id, {
      exportStatus: "exported",
      exportedAt: now,
      updatedAt: now
    });

    return { ok: true };
  }
});

export const requestReprocess = mutation({
  args: { captureId: v.string() },
  handler: async (ctx, args) => {
    const capture = await ctx.db
      .query("captures")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .unique();

    if (!capture) {
      throw new Error("Capture not found");
    }

    const now = Date.now();
    await ctx.db.patch(capture._id, {
      extractionStatus: "queued",
      lastError: undefined,
      updatedAt: now
    });

    const job = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .first();

    if (job) {
      await ctx.db.patch(job._id, {
        status: "queued",
        scheduledAt: now,
        updatedAt: now,
        lastError: undefined
      });
    } else {
      await ctx.db.insert("enrichmentJobs", {
        jobId: `job_${crypto.randomUUID()}`,
        captureId: args.captureId,
        status: "queued",
        attempt: 0,
        maxAttempts: 3,
        scheduledAt: now,
        updatedAt: now
      });
    }

    await ctx.scheduler.runAfter(0, internal.enrichment.processCapture, {
      captureId: args.captureId
    });

    return { ok: true, capture_id: args.captureId };
  }
});

export const getCaptureForEnrichment = internalQuery({
  args: { captureId: v.string() },
  handler: async (ctx, args) => {
    const capture = await ctx.db
      .query("captures")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .unique();

    const job = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .first();

    return { capture, job };
  }
});

export const findCaptureByCanonicalUrl = internalQuery({
  args: {
    canonicalUrl: v.string(),
    ownerAuthUserId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    if (args.ownerAuthUserId) {
      return await ctx.db
        .query("captures")
        .withIndex("by_owner_canonical_url", (q) =>
          q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("canonicalUrl", args.canonicalUrl)
        )
        .first();
    }

    return await ctx.db
      .query("captures")
      .withIndex("by_canonical_url", (q) => q.eq("canonicalUrl", args.canonicalUrl))
      .first();
  }
});

export const markEnrichmentProcessing = internalMutation({
  args: {
    captureId: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const capture = await ctx.db
      .query("captures")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .unique();

    if (!capture) throw new Error("Capture not found");

    await ctx.db.patch(capture._id, {
      extractionStatus: "processing",
      updatedAt: now
    });

    const job = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .first();

    if (job) {
      await ctx.db.patch(job._id, {
        status: "processing",
        startedAt: now,
        updatedAt: now,
        attempt: job.attempt + 1
      });
    }

    return { ok: true };
  }
});

export const markEnrichmentSuccess = internalMutation({
  args: {
    captureId: v.string(),
    status: v.union(v.literal("enriched"), v.literal("partial")),
    author: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    previewImage: v.optional(v.string()),
    title: v.optional(v.string()),
    summary: v.optional(v.string()),
    textContent: v.optional(v.string()),
    confidence: v.number(),
    platformIds: v.optional(v.any()),
    rawPayload: v.optional(v.any()),
    contentHash: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const capture = await ctx.db
      .query("captures")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .unique();

    if (!capture) throw new Error("Capture not found");

    await ctx.db.patch(capture._id, {
      extractionStatus: args.status,
      author: args.author,
      publishedAt: args.publishedAt,
      previewImage: args.previewImage ?? capture.previewImage,
      titleHint: args.title ?? capture.titleHint,
      confidence: args.confidence,
      platformIds: args.platformIds ?? capture.platformIds,
      rawPayload: mergeRawPayload(capture.rawPayload, args.rawPayload),
      contentHash: args.contentHash,
      lastError: undefined,
      updatedAt: now
    });

    const job = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .first();

    if (job) {
      await ctx.db.patch(job._id, {
        status: "completed",
        finishedAt: now,
        updatedAt: now,
        lastError: undefined
      });
    }

    const path = deterministicMarkdownPath({
      capturedAt: capture.capturedAt,
      platform: capture.platform,
      captureId: capture.captureId
    });

    const frontmatter = {
      id: capture.captureId,
      source_url: capture.sourceUrl,
      canonical_url: capture.canonicalUrl,
      author: args.author ?? null,
      published_at: args.publishedAt ?? null,
      preview_image: args.previewImage ?? capture.previewImage ?? null,
      platform: capture.platform,
      platform_ids: args.platformIds ?? capture.platformIds ?? {},
      captured_at: capture.capturedAt,
      device_id: capture.deviceId,
      capture_method: capture.captureMethod,
      source_app: capture.sourceApp,
      extraction_status: args.status,
      confidence: args.confidence,
      content_hash: args.contentHash ?? null,
      dedupe_keys: {
        capture_hash: capture.captureHash,
        captured_bucket: capture.capturedBucket
      },
      created_at: capture.createdAt,
      updated_at: now
    };

    const markdown = renderMarkdownDocument({
      frontmatter,
      sourceUrl: capture.sourceUrl,
      title: args.title ?? capture.titleHint,
      summary: args.summary,
      body: args.textContent
    });

    const existingDoc = await ctx.db
      .query("markdownDocuments")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .unique();

    if (existingDoc) {
      await ctx.db.patch(existingDoc._id, {
        markdown,
        path,
        frontmatter,
        exportStatus: "pending",
        updatedAt: now
      });
    } else {
      await ctx.db.insert("markdownDocuments", {
        documentId: `doc_${crypto.randomUUID()}`,
        captureId: args.captureId,
        path,
        markdown,
        frontmatter,
        exportStatus: "pending",
        createdAt: now,
        updatedAt: now
      });
    }

    if (capture.ownerAuthUserId) {
      await ctx.scheduler.runAfter(0, internal.derived.processCapture, {
        captureId: args.captureId
      });
    }

    return { ok: true, captureId: args.captureId, status: args.status };
  }
});

function mergeRawPayload(existingPayload: unknown, nextPayload: unknown): unknown {
  if (!nextPayload) {
    return existingPayload;
  }

  if (!existingPayload) {
    return nextPayload;
  }

  if (isPlainObject(existingPayload) && isPlainObject(nextPayload)) {
    return {
      ...existingPayload,
      ...nextPayload
    };
  }

  return nextPayload;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const markEnrichmentFailure = internalMutation({
  args: {
    captureId: v.string(),
    error: v.string(),
    payload: v.optional(v.any())
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const capture = await ctx.db
      .query("captures")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .unique();

    if (!capture) throw new Error("Capture not found");

    const job = await ctx.db
      .query("enrichmentJobs")
      .withIndex("by_capture_id", (q) => q.eq("captureId", args.captureId))
      .first();

    const maxAttempts = job?.maxAttempts ?? 3;
    const attempt = job?.attempt ?? capture.enrichmentAttempts;
    const shouldDeadLetter = attempt >= maxAttempts;

    await ctx.db.patch(capture._id, {
      extractionStatus: shouldDeadLetter ? "dead_letter" : "failed",
      enrichmentAttempts: attempt,
      lastError: args.error,
      updatedAt: now
    });

    if (job) {
      await ctx.db.patch(job._id, {
        status: shouldDeadLetter ? "dead_letter" : "failed",
        finishedAt: now,
        updatedAt: now,
        lastError: args.error
      });
    }

    if (shouldDeadLetter) {
      await ctx.db.insert("deadLetters", {
        deadLetterId: `dlq_${crypto.randomUUID()}`,
        captureId: args.captureId,
        jobId: job?.jobId,
        error: args.error,
        payload: args.payload,
        createdAt: now
      });
      return { ok: true, deadLettered: true };
    }

    await ctx.scheduler.runAfter(60_000, internal.enrichment.processCapture, {
      captureId: args.captureId
    });

    return { ok: true, deadLettered: false };
  }
});

export const listCapturesByWindow = query({
  args: {
    from: v.number(),
    to: v.number(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 300, 2000);
    const rows = await ctx.db.query("captures").withIndex("by_created_at").order("desc").take(limit);
    return rows.filter((row) => row.capturedAt >= args.from && row.capturedAt < args.to);
  }
});
