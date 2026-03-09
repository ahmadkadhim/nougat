import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const extractionStatus = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("enriched"),
  v.literal("partial"),
  v.literal("failed"),
  v.literal("dead_letter")
);

const jobStatus = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("dead_letter")
);

const reviewStatus = v.union(v.literal("pending_review"), v.literal("approved"), v.literal("rejected"));
const markdownExportStatus = v.union(v.literal("pending"), v.literal("exported"));

export default defineSchema({
  devices: defineTable({
    deviceId: v.string(),
    name: v.string(),
    platform: v.string(),
    tokenHash: v.string(),
    tokenVersion: v.number(),
    scopes: v.array(v.string()),
    status: v.union(v.literal("active"), v.literal("revoked")),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastSeenAt: v.optional(v.number()),
    rotatedAt: v.optional(v.number())
  })
    .index("by_device_id", ["deviceId"])
    .index("by_token_hash", ["tokenHash"])
    .index("by_status", ["status"]),

  captures: defineTable({
    captureId: v.string(),
    ownerAuthUserId: v.optional(v.string()),
    sourceUrl: v.string(),
    canonicalUrl: v.string(),
    platform: v.string(),
    platformIds: v.optional(v.any()),
    author: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    previewImage: v.optional(v.string()),
    capturedAt: v.number(),
    capturedBucket: v.number(),
    deviceId: v.string(),
    captureMethod: v.string(),
    sourceApp: v.string(),
    extractionStatus,
    confidence: v.optional(v.number()),
    titleHint: v.optional(v.string()),
    selectedText: v.optional(v.string()),
    tabContext: v.optional(v.string()),
    sourceMetadata: v.optional(v.any()),
    rawPayload: v.optional(v.any()),
    captureHash: v.string(),
    contentHash: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    enrichmentAttempts: v.number(),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_capture_id", ["captureId"])
    .index("by_device_hash_bucket", ["deviceId", "captureHash", "capturedBucket"])
    .index("by_canonical_url", ["canonicalUrl"])
    .index("by_owner_canonical_url", ["ownerAuthUserId", "canonicalUrl"])
    .index("by_status", ["extractionStatus"])
    .index("by_created_at", ["createdAt"])
    .index("by_owner_created_at", ["ownerAuthUserId", "createdAt"]),

  enrichmentJobs: defineTable({
    jobId: v.string(),
    captureId: v.string(),
    status: jobStatus,
    attempt: v.number(),
    maxAttempts: v.number(),
    scheduledAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    updatedAt: v.number()
  })
    .index("by_job_id", ["jobId"])
    .index("by_capture_id", ["captureId"])
    .index("by_status", ["status"]),

  markdownDocuments: defineTable({
    documentId: v.string(),
    captureId: v.string(),
    path: v.string(),
    markdown: v.string(),
    frontmatter: v.any(),
    exportStatus: markdownExportStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
    exportedAt: v.optional(v.number())
  })
    .index("by_document_id", ["documentId"])
    .index("by_capture_id", ["captureId"])
    .index("by_export_status", ["exportStatus"]),

  deadLetters: defineTable({
    deadLetterId: v.string(),
    captureId: v.string(),
    jobId: v.optional(v.string()),
    error: v.string(),
    payload: v.optional(v.any()),
    createdAt: v.number()
  }).index("by_capture_id", ["captureId"]),

  duplicates: defineTable({
    duplicateId: v.string(),
    captureId: v.string(),
    duplicateOfCaptureId: v.string(),
    reason: v.string(),
    createdAt: v.number()
  })
    .index("by_capture_id", ["captureId"])
    .index("by_duplicate_of", ["duplicateOfCaptureId"]),

  rateLimits: defineTable({
    deviceId: v.string(),
    windowKey: v.string(),
    count: v.number(),
    updatedAt: v.number()
  }).index("by_device_window", ["deviceId", "windowKey"]),

  digests: defineTable({
    digestId: v.string(),
    period: v.union(v.literal("daily"), v.literal("weekly")),
    windowStart: v.number(),
    windowEnd: v.number(),
    title: v.string(),
    summary: v.string(),
    markdown: v.string(),
    createdAt: v.number()
  })
    .index("by_period_window", ["period", "windowStart"])
    .index("by_created_at", ["createdAt"]),

  xBookmarkSyncState: defineTable({
    ownerAuthUserId: v.optional(v.string()),
    sourceKey: v.string(),
    lastSeenTweetId: v.optional(v.string()),
    lastRunAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    importedCount: v.number(),
    duplicateCount: v.number(),
    updatedAt: v.number()
  })
    .index("by_source_key", ["sourceKey"])
    .index("by_owner_source_key", ["ownerAuthUserId", "sourceKey"]),

  xOAuthStates: defineTable({
    ownerAuthUserId: v.optional(v.string()),
    provider: v.string(),
    state: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
    status: v.union(v.literal("pending"), v.literal("completed"), v.literal("failed")),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_provider_state", ["provider", "state"])
    .index("by_owner_provider_state", ["ownerAuthUserId", "provider", "state"]),

  xOAuthCredentials: defineTable({
    ownerAuthUserId: v.optional(v.string()),
    provider: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    tokenType: v.optional(v.string()),
    scopes: v.array(v.string()),
    userId: v.optional(v.string()),
    username: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_provider", ["provider"])
    .index("by_owner_provider", ["ownerAuthUserId", "provider"]),

  processingRuns: defineTable({
    runId: v.string(),
    ownerAuthUserId: v.optional(v.string()),
    captureId: v.string(),
    stage: v.literal("evaluation"),
    status: jobStatus,
    inputHash: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number())
  })
    .index("by_run_id", ["runId"])
    .index("by_capture_stage", ["captureId", "stage"])
    .index("by_owner_stage_status", ["ownerAuthUserId", "stage", "status"]),

  tags: defineTable({
    tagId: v.string(),
    ownerAuthUserId: v.optional(v.string()),
    name: v.string(),
    slug: v.string(),
    parentTagId: v.optional(v.string()),
    description: v.optional(v.string()),
    usageCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_tag_id", ["tagId"])
    .index("by_owner_slug", ["ownerAuthUserId", "slug"])
    .index("by_owner_usage", ["ownerAuthUserId", "usageCount"]),

  tagAssignments: defineTable({
    assignmentId: v.string(),
    ownerAuthUserId: v.optional(v.string()),
    captureId: v.string(),
    tagId: v.string(),
    tagName: v.string(),
    tagSlug: v.string(),
    role: v.union(v.literal("primary"), v.literal("secondary")),
    sourceType: v.union(v.literal("system"), v.literal("manual")),
    reviewStatus,
    confidence: v.number(),
    justification: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    reviewedAt: v.optional(v.number())
  })
    .index("by_assignment_id", ["assignmentId"])
    .index("by_capture", ["captureId"])
    .index("by_owner_review_status", ["ownerAuthUserId", "reviewStatus"])
    .index("by_owner_capture_status", ["ownerAuthUserId", "captureId", "reviewStatus"]),

  knowledgeItems: defineTable({
    knowledgeItemId: v.string(),
    ownerAuthUserId: v.optional(v.string()),
    primaryCaptureId: v.string(),
    sourceCaptureIds: v.array(v.string()),
    sourceAuthor: v.optional(v.string()),
    canonicalUrl: v.string(),
    tagSlug: v.optional(v.string()),
    title: v.string(),
    content: v.string(),
    sourceQuote: v.optional(v.string()),
    reviewStatus,
    confidence: v.number(),
    justification: v.optional(v.string()),
    markdownPath: v.optional(v.string()),
    markdown: v.optional(v.string()),
    exportStatus: v.optional(markdownExportStatus),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number())
  })
    .index("by_knowledge_item_id", ["knowledgeItemId"])
    .index("by_owner_review_status", ["ownerAuthUserId", "reviewStatus"])
    .index("by_owner_primary_capture", ["ownerAuthUserId", "primaryCaptureId"])
    .index("by_owner_export_status", ["ownerAuthUserId", "exportStatus"]),

  knowledgeItemSources: defineTable({
    knowledgeItemId: v.string(),
    captureId: v.string(),
    quote: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    createdAt: v.number()
  })
    .index("by_knowledge_item", ["knowledgeItemId"])
    .index("by_capture", ["captureId"]),

  taskCandidates: defineTable({
    taskCandidateId: v.string(),
    ownerAuthUserId: v.optional(v.string()),
    primaryCaptureId: v.string(),
    sourceCaptureIds: v.array(v.string()),
    sourceAuthor: v.optional(v.string()),
    canonicalUrl: v.string(),
    tagSlug: v.optional(v.string()),
    title: v.string(),
    details: v.string(),
    assigneeType: v.union(v.literal("user"), v.literal("agent")),
    executionTarget: v.optional(v.string()),
    suggestedAction: v.optional(v.string()),
    dedupeKey: v.string(),
    reviewStatus,
    confidence: v.number(),
    justification: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number())
  })
    .index("by_task_candidate_id", ["taskCandidateId"])
    .index("by_owner_review_status", ["ownerAuthUserId", "reviewStatus"])
    .index("by_owner_dedupe_key", ["ownerAuthUserId", "dedupeKey"])
    .index("by_owner_primary_capture", ["ownerAuthUserId", "primaryCaptureId"]),

  skillCandidates: defineTable({
    skillCandidateId: v.string(),
    ownerAuthUserId: v.optional(v.string()),
    primaryCaptureId: v.string(),
    sourceCaptureIds: v.array(v.string()),
    sourceAuthor: v.optional(v.string()),
    canonicalUrl: v.string(),
    tagSlug: v.optional(v.string()),
    title: v.string(),
    details: v.string(),
    targetSystem: v.string(),
    proposedChange: v.string(),
    dedupeKey: v.string(),
    reviewStatus,
    confidence: v.number(),
    justification: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number())
  })
    .index("by_skill_candidate_id", ["skillCandidateId"])
    .index("by_owner_review_status", ["ownerAuthUserId", "reviewStatus"])
    .index("by_owner_dedupe_key", ["ownerAuthUserId", "dedupeKey"])
    .index("by_owner_primary_capture", ["ownerAuthUserId", "primaryCaptureId"]),

  resources: defineTable({
    resourceId: v.string(),
    ownerAuthUserId: v.optional(v.string()),
    primaryCaptureId: v.string(),
    sourceCaptureIds: v.array(v.string()),
    sourceAuthor: v.optional(v.string()),
    sourceCanonicalUrl: v.string(),
    resourceUrl: v.string(),
    resourceDomain: v.optional(v.string()),
    resourceType: v.string(),
    tagSlug: v.optional(v.string()),
    name: v.string(),
    creator: v.optional(v.string()),
    company: v.optional(v.string()),
    useCases: v.array(v.string()),
    details: v.string(),
    dedupeKey: v.string(),
    reviewStatus,
    confidence: v.number(),
    justification: v.optional(v.string()),
    markdownPath: v.optional(v.string()),
    markdown: v.optional(v.string()),
    exportStatus: v.optional(markdownExportStatus),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number())
  })
    .index("by_resource_id", ["resourceId"])
    .index("by_owner_review_status", ["ownerAuthUserId", "reviewStatus"])
    .index("by_owner_dedupe_key", ["ownerAuthUserId", "dedupeKey"])
    .index("by_owner_primary_capture", ["ownerAuthUserId", "primaryCaptureId"])
    .index("by_owner_export_status", ["ownerAuthUserId", "exportStatus"]),

  authorProfiles: defineTable({
    authorKey: v.string(),
    ownerAuthUserId: v.optional(v.string()),
    platform: v.string(),
    platformAuthorId: v.optional(v.string()),
    displayName: v.string(),
    username: v.optional(v.string()),
    currentTier: v.optional(v.string()),
    trustScore: v.optional(v.number()),
    signalScore: v.optional(v.number()),
    hypeScore: v.optional(v.number()),
    relevanceScore: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_author_key", ["authorKey"])
    .index("by_owner_author_key", ["ownerAuthUserId", "authorKey"]),

  authorRatings: defineTable({
    authorRatingId: v.string(),
    ownerAuthUserId: v.optional(v.string()),
    authorKey: v.string(),
    captureId: v.string(),
    sourceAuthor: v.string(),
    suggestedTier: v.string(),
    trustScore: v.number(),
    signalScore: v.number(),
    hypeScore: v.number(),
    relevanceScore: v.number(),
    reviewStatus,
    confidence: v.number(),
    justification: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    reviewedAt: v.optional(v.number())
  })
    .index("by_author_rating_id", ["authorRatingId"])
    .index("by_owner_review_status", ["ownerAuthUserId", "reviewStatus"])
    .index("by_owner_capture_status", ["ownerAuthUserId", "captureId", "reviewStatus"])
    .index("by_owner_author", ["ownerAuthUserId", "authorKey"]),

  sourceViewpoints: defineTable({
    sourceViewpointId: v.string(),
    ownerAuthUserId: v.optional(v.string()),
    captureId: v.string(),
    canonicalUrl: v.string(),
    sourceAuthor: v.optional(v.string()),
    topic: v.string(),
    conflictKey: v.string(),
    stance: v.union(v.literal("do"), v.literal("avoid"), v.literal("caution"), v.literal("tradeoff")),
    claim: v.string(),
    rationale: v.optional(v.string()),
    evidenceQuote: v.optional(v.string()),
    reviewStatus,
    confidence: v.number(),
    justification: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    reviewedAt: v.optional(v.number())
  })
    .index("by_source_viewpoint_id", ["sourceViewpointId"])
    .index("by_owner_review_status", ["ownerAuthUserId", "reviewStatus"])
    .index("by_owner_topic", ["ownerAuthUserId", "topic"])
    .index("by_owner_conflict_key", ["ownerAuthUserId", "conflictKey"]),

  reviewFeedback: defineTable({
    feedbackId: v.string(),
    ownerAuthUserId: v.optional(v.string()),
    entityType: v.string(),
    entityId: v.string(),
    action: v.union(v.literal("approve"), v.literal("reject"), v.literal("save"), v.literal("comment")),
    field: v.optional(v.string()),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    comment: v.optional(v.string()),
    createdAt: v.number()
  })
    .index("by_owner_entity", ["ownerAuthUserId", "entityType", "entityId"])
    .index("by_entity", ["entityType", "entityId"])
});
