import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CaptureCardBody, formatTimestamp, type DashboardCapture } from "./capture-card";
import { formatLocalDateTime } from "./derived-support";

type ReviewEntityType = "tag_assignment" | "note" | "task_candidate" | "skill_candidate" | "resource" | "author_rating";
type ReviewAction = "approve" | "reject" | "save" | "comment";
type ReviewSourceMode = "summary" | "full";

type ReviewFeedbackEntry = {
  action: ReviewAction;
  changedFields: string[];
  comment: string;
  createdAt: number;
  feedbackId: string;
};

type ReviewEditableField = {
  key: string;
  label: string;
  options?: string[];
  type: "text" | "textarea" | "select" | "number";
  value: any;
};

type ReviewEntityPayload = {
  assigneeType?: string;
  company?: string;
  confidence?: number;
  content?: string;
  creator?: string;
  details?: string;
  executionTarget?: string;
  feedbackHistory: ReviewFeedbackEntry[];
  hypeScore?: number;
  id: string;
  lastSavedAt?: number | null;
  mode?: string;
  name?: string;
  proposedChange?: string;
  relevanceScore?: number;
  resourceType?: string;
  resourceUrl?: string;
  role?: string;
  signalScore?: number;
  sourceAuthor?: string | null;
  sourceQuote?: string;
  suggestedAction?: string;
  suggestedTier?: string;
  targetSkillRef?: string;
  targetSystem?: string;
  title?: string;
  triggerContext?: string;
  trustScore?: number;
  useCases?: string[];
  why?: string;
  reviewStatus?: string;
};

export type ReviewQueueItem = {
  authorRatings: ReviewEntityPayload[];
  capture: DashboardCapture;
  notes: ReviewEntityPayload[];
  pendingCount: number;
  resources: ReviewEntityPayload[];
  skillCandidates: ReviewEntityPayload[];
  statusCounts: {
    approved: number;
    pending: number;
    rejected: number;
    saved: number;
  };
  tags: ReviewEntityPayload[];
  taskCandidates: ReviewEntityPayload[];
};

type EntityConfig = {
  badgeKeys: string[];
  headlineKey: string;
  largePreviewKeys?: string[];
  previewKeys: string[];
};

const ENTITY_CONFIG: Record<ReviewEntityType, EntityConfig> = {
  author_rating: {
    badgeKeys: ["suggestedTier", "trustScore", "signalScore", "hypeScore", "relevanceScore"],
    headlineKey: "suggestedTier",
    previewKeys: ["why"]
  },
  note: {
    badgeKeys: [],
    headlineKey: "title",
    largePreviewKeys: ["content", "sourceQuote"],
    previewKeys: ["content", "sourceQuote", "why"]
  },
  resource: {
    badgeKeys: ["resourceType", "company", "creator"],
    headlineKey: "name",
    previewKeys: ["details", "resourceUrl", "useCases", "why"]
  },
  skill_candidate: {
    badgeKeys: ["mode", "targetSystem", "targetSkillRef"],
    headlineKey: "title",
    largePreviewKeys: ["proposedChange"],
    previewKeys: ["details", "proposedChange", "why"]
  },
  tag_assignment: {
    badgeKeys: ["role"],
    headlineKey: "name",
    previewKeys: ["why"]
  },
  task_candidate: {
    badgeKeys: ["assigneeType", "executionTarget"],
    headlineKey: "title",
    previewKeys: ["details", "triggerContext", "suggestedAction", "why"]
  }
};

export function ReviewOutputCard({ item }: { item: ReviewQueueItem }) {
  const reviewEntity = useMutation(api.derived.reviewEntity);
  const [sourceMode, setSourceMode] = useState<ReviewSourceMode>(() => getDefaultSourceMode(item.capture));
  const sections = [
    {
      entities: item.tags,
      title: "Tags",
      entityType: "tag_assignment" as const
    },
    {
      entities: item.notes,
      title: "Notes",
      entityType: "note" as const
    },
    {
      entities: item.taskCandidates,
      title: "Tasks",
      entityType: "task_candidate" as const
    },
    {
      entities: item.skillCandidates,
      title: "Skills",
      entityType: "skill_candidate" as const
    },
    {
      entities: item.resources,
      title: "Resources",
      entityType: "resource" as const
    },
    {
      entities: item.authorRatings,
      title: "Author Rating",
      entityType: "author_rating" as const
    }
  ].filter((section) => section.entities.length > 0);

  useEffect(() => {
    setSourceMode(getDefaultSourceMode(item.capture));
  }, [item.capture.id]);

  return (
    <article className="panel review-card review-focus-card">
      <div className="review-card-header review-card-header-compact">
        <div>
          <p className="panel-label">Active review</p>
          <h2>{item.pendingCount} pending bits from one capture</h2>
        </div>
        <div className="pill-list review-count-pills">
          <span className="pill">Pending {item.statusCounts.pending}</span>
          <span className="pill">Saved {item.statusCounts.saved}</span>
          <span className="pill">Approved {item.statusCounts.approved}</span>
          <span className="pill">Rejected {item.statusCounts.rejected}</span>
        </div>
      </div>

      <p className="review-flow-banner">
        Read first. Edit only when a bit is fundamentally right. Notes stay separate unless you attach one to a decision.
      </p>

      <div className={`review-workspace ${sourceMode === "summary" ? "is-source-summary" : ""}`}>
        <aside className="review-context-column">
          <section className="review-context-card capture-workspace-main">
            <div className="review-context-header">
              <div>
                <p className="panel-label">Source</p>
                <h3>{item.capture.author ?? item.capture.title}</h3>
              </div>
              <div className="review-context-controls">
                <div aria-label="Source density" className="review-view-toggle">
                  <button
                    aria-pressed={sourceMode === "summary"}
                    className={`review-view-toggle-button ${sourceMode === "summary" ? "is-active" : ""}`}
                    onClick={() => setSourceMode("summary")}
                    type="button"
                  >
                    Summary
                  </button>
                  <button
                    aria-pressed={sourceMode === "full"}
                    className={`review-view-toggle-button ${sourceMode === "full" ? "is-active" : ""}`}
                    onClick={() => setSourceMode("full")}
                    type="button"
                  >
                    Full
                  </button>
                </div>
                <a className="secondary-button review-context-link" href={item.capture.canonicalUrl} rel="noreferrer" target="_blank">
                  Open source
                </a>
              </div>
            </div>
            {sourceMode === "summary" ? (
              <ReviewSourceSummary capture={item.capture} />
            ) : (
              <CaptureCardBody capture={item.capture} showFooter={false} showOpenLink={false} />
            )}
          </section>
        </aside>

        <div className="review-lane-grid">
          {sections.map((section) => (
            <ReviewSection count={section.entities.length} key={section.title} title={section.title}>
              {section.entities.map((entity: ReviewEntityPayload) => (
                <EditableEntityCard
                  entity={entity}
                  entityType={section.entityType}
                  key={entity.id}
                  reviewEntity={reviewEntity}
                />
              ))}
            </ReviewSection>
          ))}
        </div>
      </div>
    </article>
  );
}

function ReviewSection({ children, count, title }: { children: ReactNode; count: number; title: string }) {
  return (
    <section className="review-section">
      <div className="review-section-header">
        <h3>{title}</h3>
        <span className="review-section-count">{count}</span>
      </div>
      <div className="review-section-body">{children}</div>
    </section>
  );
}

function EditableEntityCard({
  entity,
  entityType,
  reviewEntity
}: {
  entity: ReviewEntityPayload;
  entityType: ReviewEntityType;
  reviewEntity: any;
}) {
  const fields = useMemo(() => buildFields(entityType, entity), [entity, entityType]);
  const [values, setValues] = useState(() => createValueState(fields));
  const [initialValues, setInitialValues] = useState(() => createValueState(fields));
  const [comment, setComment] = useState("");
  const [feedbackHistory, setFeedbackHistory] = useState(entity.feedbackHistory);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(entity.lastSavedAt ?? null);
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCommentOpen, setIsCommentOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isPending, setPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<"error" | "neutral" | "success">("neutral");

  useEffect(() => {
    const nextValues = createValueState(fields);
    setValues(nextValues);
    setInitialValues(nextValues);
    setComment("");
    setFeedbackHistory(entity.feedbackHistory);
    setIsExpanded(false);
    setIsCommentOpen(false);
    setIsEditing(false);
    setIsHistoryOpen(false);
    setLastSavedAt(entity.lastSavedAt ?? null);
    setStatusMessage(null);
    setStatusTone("neutral");
  }, [entity.feedbackHistory, entity.id, entity.lastSavedAt, fields]);

  useEffect(() => {
    if (isEditing || isCommentOpen || isHistoryOpen) {
      setIsExpanded(true);
    }
  }, [isCommentOpen, isEditing, isHistoryOpen]);

  const config = ENTITY_CONFIG[entityType];
  const pendingFieldChanges = useMemo(
    () => getPendingFieldChanges(fields, values, initialValues),
    [fields, initialValues, values]
  );
  const hasFieldChanges = pendingFieldChanges.length > 0;
  const hasCommentDraft = comment.trim().length > 0;
  const latestFeedback = feedbackHistory[0];
  const headline = buildEntityHeadline(entityType, values, entity);
  const metaBadges = buildEntityBadges(entityType, values, entity);
  const previewRows = buildEntityPreviewRows(entityType, values, entity);
  const showExpandedState = isExpanded || isEditing || isCommentOpen || isHistoryOpen || hasFieldChanges || hasCommentDraft;
  const visiblePreviewRows = showExpandedState ? previewRows : previewRows.slice(0, 1);
  const hiddenPreviewCount = Math.max(0, previewRows.length - visiblePreviewRows.length);
  const canExpand = !showExpandedState && (previewRows.length > 1 || feedbackHistory.length > 0);
  const canCollapse = showExpandedState && !isEditing && !hasFieldChanges && !hasCommentDraft && !isCommentOpen && !isHistoryOpen;

  async function runAction(action: ReviewAction) {
    const trimmedComment = comment.trim();
    if (action === "comment" && !trimmedComment) {
      setStatusMessage("Write a note before saving it.");
      setStatusTone("error");
      return;
    }

    setPending(true);
    setStatusMessage(null);

    try {
      const normalizedUpdates = normalizeUpdates(values);
      const includedComment = action === "comment" || action === "approve" || action === "reject" ? trimmedComment || undefined : undefined;
      const result = await reviewEntity({
        action,
        comment: includedComment,
        entityId: entity.id,
        entityType,
        updates: action === "comment" ? undefined : normalizedUpdates
      });

      const newEntry = {
        action,
        changedFields: result.changedFields ?? [],
        comment: includedComment ?? "",
        createdAt: result.savedAt,
        feedbackId: result.feedbackId
      };

      setFeedbackHistory((current) => [newEntry, ...current]);
      setLastSavedAt(result.savedAt ?? Date.now());

      if (action !== "comment") {
        setInitialValues(values);
      }
      if (action === "save") {
        setIsEditing(false);
        setIsExpanded(hasCommentDraft);
      } else if (action === "comment") {
        setComment("");
        setIsCommentOpen(false);
        setIsHistoryOpen(true);
        setIsExpanded(true);
      } else {
        setComment("");
        setIsEditing(false);
        setIsCommentOpen(false);
        setIsHistoryOpen(true);
      }

      setStatusTone("success");
      setStatusMessage(
        buildStatusMessage(action, result.changedFields ?? [], result.savedAt, {
          includedComment: Boolean(includedComment),
          preservedCommentDraft: action === "save" && hasCommentDraft
        })
      );
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error instanceof Error ? error.message : "Unable to save review changes.");
    } finally {
      setPending(false);
    }
  }

  function cancelEdits() {
    setValues(initialValues);
    setIsEditing(false);
    setStatusMessage(null);
    setStatusTone("neutral");
  }

  return (
    <article className={`review-entity-card ${isEditing ? "is-editing" : ""}`}>
      <div className="review-entity-head">
        <div className="review-entity-headline">
          <p className="review-entity-kicker">{entityType === "author_rating" ? entity.sourceAuthor ?? "Author" : readSummary(entity)}</p>
          <h4>{headline}</h4>
        </div>
        <div className="review-entity-toolbar">
          {metaBadges.map((badge) => (
            <span className="review-badge" key={badge}>
              {badge}
            </span>
          ))}
          {canExpand ? (
            <button className="tertiary-button review-inline-button" onClick={() => setIsExpanded(true)} type="button">
              Details
            </button>
          ) : null}
          {canCollapse ? (
            <button className="tertiary-button review-inline-button" onClick={() => setIsExpanded(false)} type="button">
              Collapse
            </button>
          ) : null}
          <button
            className="tertiary-button review-inline-button"
            onClick={() => {
              if (isEditing) {
                cancelEdits();
                return;
              }
              setIsExpanded(true);
              setIsEditing(true);
            }}
            type="button"
          >
            {isEditing ? "Cancel" : "Edit"}
          </button>
        </div>
      </div>

      {!isEditing ? (
        <div className="review-preview-stack">
          {visiblePreviewRows.map((row) => (
            <div className={`review-preview-row ${row.emphasis ? `is-${row.emphasis}` : ""}`} key={`${row.label}-${row.value}`}>
              <span className="review-preview-label">{row.label}</span>
              <p className={`review-preview-value ${config.largePreviewKeys?.includes(row.key) ? "is-large" : ""}`}>{row.value}</p>
            </div>
          ))}
          {!showExpandedState && hiddenPreviewCount > 0 ? (
            <p className="review-preview-more">+{hiddenPreviewCount} more detail{hiddenPreviewCount === 1 ? "" : "s"}</p>
          ) : null}
        </div>
      ) : (
        <div className="review-editor-grid">
          {fields.map((field) => (
            <label className={`review-field ${field.type === "textarea" ? "is-wide" : ""}`} key={field.key}>
              <span>{field.label}</span>
              {field.type === "textarea" ? (
                <textarea
                  rows={field.key === "content" || field.key === "proposedChange" || field.key === "details" ? 5 : 3}
                  value={String(values[field.key] ?? "")}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              ) : field.type === "select" ? (
                <select
                  value={String(values[field.key] ?? "")}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                >
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === "number" ? "number" : "text"}
                  value={String(values[field.key] ?? "")}
                  onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              )}
            </label>
          ))}
        </div>
      )}

      <div className="review-entity-footer">
        <div className="review-entity-status">
          <p className="panel-meta">{buildSaveStateLabel(hasFieldChanges, hasCommentDraft, lastSavedAt)}</p>
          {statusMessage ? <p className={`panel-meta review-status-message is-${statusTone}`}>{statusMessage}</p> : null}
        </div>

        <div className="review-inline-actions">
          <button
            className="tertiary-button review-inline-button"
            onClick={() => {
              setIsExpanded(true);
              setIsCommentOpen((current) => !current);
            }}
            type="button"
          >
            {isCommentOpen ? "Hide note" : hasCommentDraft ? "Resume note" : "Add note"}
          </button>
          {feedbackHistory.length ? (
            <button
              className="tertiary-button review-inline-button"
              onClick={() => {
                setIsExpanded(true);
                setIsHistoryOpen((current) => !current);
              }}
              type="button"
            >
              {isHistoryOpen ? "Hide history" : `History ${feedbackHistory.length}`}
            </button>
          ) : null}
        </div>
      </div>

      {showExpandedState && latestFeedback ? (
        <div className="review-latest-feedback">
          <span className={`review-history-pill is-${latestFeedback.action}`}>{formatFeedbackAction(latestFeedback.action)}</span>
          <span className="panel-meta">{formatLocalDateTime(latestFeedback.createdAt)}</span>
          {latestFeedback.changedFields.length ? (
            <span className="panel-meta">{buildFieldChangeSummary(latestFeedback.changedFields)}</span>
          ) : null}
        </div>
      ) : null}

      {showExpandedState && isCommentOpen ? (
        <div className="review-note-composer">
          <label className="review-field is-wide">
            <span>Review note</span>
            <textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
          </label>
          <div className="review-note-toolbar">
            <p className="panel-meta">Notes are separate from edits. Approve or reject can include this note.</p>
            <button className="secondary-button review-inline-button" disabled={isPending || !hasCommentDraft} onClick={() => runAction("comment")} type="button">
              Add note
            </button>
          </div>
        </div>
      ) : null}

      {showExpandedState && isHistoryOpen && feedbackHistory.length ? (
        <div className="review-feedback-history">
          {feedbackHistory.map((entry) => (
            <article className="review-feedback-item" key={entry.feedbackId}>
              <div className="review-feedback-topline">
                <span className={`review-history-pill is-${entry.action}`}>{formatFeedbackAction(entry.action)}</span>
                <span className="panel-meta">{formatLocalDateTime(entry.createdAt)}</span>
              </div>
              {entry.changedFields.length ? <p className="panel-meta">{buildFieldChangeSummary(entry.changedFields)}</p> : null}
              {entry.comment ? <p className="review-feedback-comment">{entry.comment}</p> : null}
            </article>
          ))}
        </div>
      ) : null}

      <div className="review-decision-bar">
        <div className="review-decision-context">
          <p className="panel-meta">{buildDecisionHint(showExpandedState, pendingFieldChanges.length, hasCommentDraft, latestFeedback)}</p>
          {hasFieldChanges || hasCommentDraft ? (
            <div className="review-decision-modifiers">
              {hasFieldChanges ? (
                <span className="review-decision-pill">
                  {pendingFieldChanges.length} pending edit{pendingFieldChanges.length === 1 ? "" : "s"}
                </span>
              ) : null}
              {hasCommentDraft ? <span className="review-decision-pill">Note attached</span> : null}
            </div>
          ) : null}
        </div>
        <div className="review-decision-actions">
          {isEditing || hasFieldChanges ? (
            <button className="secondary-button review-inline-button" disabled={isPending || !hasFieldChanges} onClick={() => runAction("save")} type="button">
              Save edits
            </button>
          ) : null}
          <button className="primary-button review-inline-button" disabled={isPending} onClick={() => runAction("approve")} type="button">
            Approve
          </button>
          <button className="danger-button review-inline-button" disabled={isPending} onClick={() => runAction("reject")} type="button">
            Reject
          </button>
        </div>
      </div>
    </article>
  );
}

type ReviewPreviewRow = {
  emphasis?: "muted" | "quote";
  key: string;
  label: string;
  value: string;
};

type ReviewSourceSummaryRow = {
  label: string;
  value: string;
};

function ReviewSourceSummary({ capture }: { capture: DashboardCapture }) {
  const rows = buildSourceSummaryRows(capture);
  const sourceText = capture.xPost?.text?.trim();
  const hasHiddenSourceDetail = Boolean(capture.xPost?.mediaPreviewUrls.length || capture.xPost?.quote || capture.xPost?.linkPreview);

  return (
    <div className="review-source-summary">
      <div className="review-source-summary-hero">
        <span className="review-source-platform">{capture.platform.toUpperCase()}</span>
        <p className="review-source-title">{capture.title}</p>
        {sourceText ? <p className="review-source-text">{sourceText}</p> : null}
      </div>

      <div className="review-source-summary-grid">
        {rows.map((row) => (
          <div className="review-source-summary-row" key={`${row.label}-${row.value}`}>
            <span className="review-source-summary-label">{row.label}</span>
            <p className="review-source-summary-value">{row.value}</p>
          </div>
        ))}
      </div>

      {hasHiddenSourceDetail ? <p className="review-source-summary-note">Switch to full view for media, quote, and link preview detail.</p> : null}
    </div>
  );
}

function buildFields(entityType: ReviewEntityType, entity: ReviewEntityPayload): ReviewEditableField[] {
  switch (entityType) {
    case "tag_assignment":
      return [
        { key: "name", label: "Tag", type: "text", value: entity.name },
        { key: "role", label: "Role", type: "select", value: entity.role, options: ["primary", "secondary"] },
        { key: "why", label: "Why", type: "textarea", value: entity.why }
      ];
    case "note":
      return [
        { key: "title", label: "Title", type: "text", value: entity.title },
        { key: "content", label: "Note", type: "textarea", value: entity.content },
        { key: "sourceQuote", label: "Quote", type: "textarea", value: entity.sourceQuote },
        { key: "why", label: "Why", type: "textarea", value: entity.why }
      ];
    case "task_candidate":
      return [
        { key: "title", label: "Title", type: "text", value: entity.title },
        { key: "details", label: "Task", type: "textarea", value: entity.details },
        { key: "assigneeType", label: "Assignee", type: "select", value: entity.assigneeType, options: ["user", "agent"] },
        { key: "executionTarget", label: "Execution target", type: "text", value: entity.executionTarget },
        { key: "triggerContext", label: "Trigger/context", type: "textarea", value: entity.triggerContext },
        { key: "suggestedAction", label: "Suggested action", type: "textarea", value: entity.suggestedAction },
        { key: "why", label: "Why", type: "textarea", value: entity.why }
      ];
    case "skill_candidate":
      return [
        { key: "title", label: "Title", type: "text", value: entity.title },
        { key: "details", label: "Details", type: "textarea", value: entity.details },
        { key: "mode", label: "Mode", type: "select", value: entity.mode, options: ["draft", "delta"] },
        { key: "targetSystem", label: "Target system", type: "text", value: entity.targetSystem },
        { key: "targetSkillRef", label: "Target skill ref", type: "text", value: entity.targetSkillRef },
        { key: "proposedChange", label: "Proposed change", type: "textarea", value: entity.proposedChange },
        { key: "why", label: "Why", type: "textarea", value: entity.why }
      ];
    case "resource":
      return [
        { key: "name", label: "Name", type: "text", value: entity.name },
        { key: "resourceType", label: "Type", type: "text", value: entity.resourceType },
        { key: "resourceUrl", label: "URL", type: "text", value: entity.resourceUrl },
        { key: "company", label: "Company", type: "text", value: entity.company },
        { key: "creator", label: "Creator", type: "text", value: entity.creator },
        { key: "useCases", label: "Use cases (comma-separated)", type: "text", value: entity.useCases?.join(", ") },
        { key: "details", label: "Details", type: "textarea", value: entity.details },
        { key: "why", label: "Why", type: "textarea", value: entity.why }
      ];
    case "author_rating":
      return [
        { key: "suggestedTier", label: "Tier", type: "select", value: entity.suggestedTier, options: ["S", "A", "B", "C", "D", "E", "F"] },
        { key: "trustScore", label: "Trust", type: "number", value: entity.trustScore },
        { key: "signalScore", label: "Signal", type: "number", value: entity.signalScore },
        { key: "hypeScore", label: "Hype", type: "number", value: entity.hypeScore },
        { key: "relevanceScore", label: "Relevance", type: "number", value: entity.relevanceScore },
        { key: "why", label: "Why", type: "textarea", value: entity.why }
      ];
  }
}

function createValueState(fields: Array<{ key: string; value: any }>) {
  return Object.fromEntries(fields.map((field) => [field.key, field.value ?? ""]));
}

function getDefaultSourceMode(capture: DashboardCapture): ReviewSourceMode {
  return capture.xPost ? "summary" : "full";
}

function buildSourceSummaryRows(capture: DashboardCapture): ReviewSourceSummaryRow[] {
  const rows: ReviewSourceSummaryRow[] = [
    { label: "Saved", value: formatTimestamp(capture.sourcedAt) },
    { label: "Status", value: capture.status }
  ];

  if (capture.author) {
    rows.unshift({ label: "Author", value: capture.author });
  }

  if (capture.postedAt) {
    rows.splice(capture.author ? 1 : 0, 0, { label: "Posted", value: formatTimestamp(capture.postedAt) });
  }

  if (capture.captureMethod) {
    rows.push({ label: "Method", value: capture.captureMethod });
  }

  if (capture.xPost?.mediaPreviewUrls.length) {
    rows.push({
      label: "Media",
      value: `${capture.xPost.mediaPreviewUrls.length} attachment${capture.xPost.mediaPreviewUrls.length === 1 ? "" : "s"}`
    });
  }

  if (capture.xPost?.quote) {
    rows.push({
      label: "Quote",
      value: capture.xPost.quote.author ? `Quoted ${capture.xPost.quote.author}` : "Quoted post attached"
    });
  }

  if (capture.xPost?.linkPreview) {
    rows.push({
      label: "Link",
      value: capture.xPost.linkPreview.title ?? capture.xPost.linkPreview.domain ?? "Link preview attached"
    });
  }

  return rows.slice(0, 6);
}

function normalizeUpdates(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value
    ])
  );
}

function buildEntityHeadline(entityType: ReviewEntityType, values: Record<string, unknown>, entity: ReviewEntityPayload) {
  if (entityType === "author_rating") {
    const tier = readString(values.suggestedTier);
    return tier ? `Tier ${tier}` : entity.sourceAuthor ?? "Author rating";
  }

  const config = ENTITY_CONFIG[entityType];
  const headline = readString(values[config.headlineKey]);
  return headline ?? "Untitled";
}

function buildEntityBadges(entityType: ReviewEntityType, values: Record<string, unknown>, entity: ReviewEntityPayload) {
  const badges: string[] = [];
  for (const key of ENTITY_CONFIG[entityType].badgeKeys) {
    const value = readBadgeValue(key, values[key]);
    if (value) {
      badges.push(value);
    }
  }

  return [...new Set(badges)].slice(0, entityType === "author_rating" ? 6 : 4);
}

function buildEntityPreviewRows(entityType: ReviewEntityType, values: Record<string, unknown>, entity: ReviewEntityPayload): ReviewPreviewRow[] {
  if (entityType === "author_rating") {
    const rows: ReviewPreviewRow[] = [];
    const why = readLongValue(values.why);
    if (why) {
      rows.push({ key: "why", label: "Why", value: why });
    }
    const scores = ["trustScore", "signalScore", "hypeScore", "relevanceScore"]
      .map((key) => `${fieldLabel(key)} ${readString(values[key]) ?? "—"}`)
      .join(" · ");
    rows.push({ key: "scores", label: "Scores", value: scores, emphasis: "muted" });
    return rows;
  }

  const rows: Array<ReviewPreviewRow | null> = ENTITY_CONFIG[entityType].previewKeys.map((key) => {
    const value = readPreviewValue(key, values[key], entity);
    if (!value) return null;
    return {
      emphasis: key === "sourceQuote" ? ("quote" as const) : key === "why" ? ("muted" as const) : undefined,
      key,
      label: fieldLabel(key),
      value
    };
  });

  return rows
    .filter((row): row is ReviewPreviewRow => row !== null)
    .slice(0, 4);
}

function readSummary(entity: ReviewEntityPayload) {
  if (typeof entity.confidence === "number") {
    return `Confidence ${Math.round(entity.confidence * 100)}%`;
  }
  return undefined;
}

function readBadgeValue(key: string, value: unknown) {
  const stringValue = readString(value);
  if (!stringValue) return undefined;
  switch (key) {
    case "assigneeType":
      return stringValue === "agent" ? "Agent" : "User";
    case "executionTarget":
      return stringValue;
    case "mode":
      return stringValue === "draft" ? "Draft" : "Delta";
    case "resourceType":
      return stringValue;
    case "role":
      return stringValue === "primary" ? "Primary" : "Secondary";
    case "suggestedTier":
      return `Tier ${stringValue}`;
    case "trustScore":
    case "signalScore":
    case "hypeScore":
    case "relevanceScore":
      return `${fieldLabel(key)} ${stringValue}`;
    default:
      return stringValue;
  }
}

function readPreviewValue(key: string, value: unknown, entity: ReviewEntityPayload) {
  if (key === "resourceUrl") {
    return readString(value);
  }
  if (key === "useCases") {
    if (Array.isArray(entity.useCases) && entity.useCases.length > 0) {
      return entity.useCases.join(", ");
    }
    return readString(value);
  }
  return readLongValue(value);
}

function readLongValue(value: unknown) {
  const stringValue = readString(value);
  return stringValue?.trim() ? stringValue.trim() : undefined;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : undefined;
}

function fieldLabel(key: string) {
  switch (key) {
    case "sourceQuote":
      return "Quote";
    case "executionTarget":
      return "Execution";
    case "triggerContext":
      return "Trigger";
    case "suggestedAction":
      return "Action";
    case "targetSystem":
      return "Target";
    case "targetSkillRef":
      return "Skill ref";
    case "proposedChange":
      return "Draft";
    case "resourceUrl":
      return "URL";
    case "useCases":
      return "Use cases";
    case "trustScore":
      return "Trust";
    case "signalScore":
      return "Signal";
    case "hypeScore":
      return "Hype";
    case "relevanceScore":
      return "Relevance";
    default:
      return key.replace(/([A-Z])/g, " $1").replace(/^./, (match) => match.toUpperCase());
  }
}

function buildSaveStateLabel(hasFieldChanges: boolean, hasCommentDraft: boolean, lastSavedAt?: number | null) {
  if (hasFieldChanges && hasCommentDraft) return "Unsaved edits and note draft";
  if (hasFieldChanges) return "Unsaved edits";
  if (hasCommentDraft) return "Note draft ready";
  if (lastSavedAt) return `Saved ${formatLocalDateTime(lastSavedAt)}`;
  return "Not saved yet";
}

function getPendingFieldChanges(
  fields: ReviewEditableField[],
  values: Record<string, unknown>,
  initialValues: Record<string, unknown>
) {
  return fields.flatMap((field) => {
    const currentValue = normalizeFieldValue(field, values[field.key]);
    const initialValue = normalizeFieldValue(field, initialValues[field.key]);
    return currentValue === initialValue ? [] : [fieldLabel(field.key)];
  });
}

function normalizeFieldValue(field: ReviewEditableField, value: unknown) {
  if (field.type === "number") {
    if (typeof value === "number") return String(value);
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed === "" ? "" : String(Number(trimmed));
    }
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return value == null ? "" : String(value);
}

function formatFeedbackAction(action: ReviewAction) {
  switch (action) {
    case "approve":
      return "Approved";
    case "reject":
      return "Rejected";
    case "save":
      return "Saved";
    case "comment":
      return "Noted";
  }
}

function buildStatusMessage(
  action: ReviewAction,
  changedFields: string[],
  savedAt: number | undefined,
  options: { includedComment: boolean; preservedCommentDraft: boolean }
) {
  const timestamp = savedAt ? formatLocalDateTime(savedAt) : "just now";
  if (action === "comment") return `Note saved ${timestamp}.`;
  if (action === "save") {
    const fieldSummary = changedFields.length === 0 ? "Edits saved" : `Saved ${changedFields.length} field${changedFields.length === 1 ? "" : "s"}`;
    return options.preservedCommentDraft ? `${fieldSummary} ${timestamp}. Note draft kept.` : `${fieldSummary} ${timestamp}.`;
  }
  if (action === "approve") {
    if (changedFields.length > 0 && options.includedComment) return `Approved after ${changedFields.length} correction${changedFields.length === 1 ? "" : "s"} and note ${timestamp}.`;
    if (changedFields.length > 0) return `Approved after ${changedFields.length} correction${changedFields.length === 1 ? "" : "s"} ${timestamp}.`;
    if (options.includedComment) return `Approved with note ${timestamp}.`;
    return `Approved ${timestamp}.`;
  }
  if (changedFields.length > 0 && options.includedComment) return `Rejected after ${changedFields.length} correction${changedFields.length === 1 ? "" : "s"} and note ${timestamp}.`;
  if (changedFields.length > 0) return `Rejected after ${changedFields.length} correction${changedFields.length === 1 ? "" : "s"} ${timestamp}.`;
  if (options.includedComment) return `Rejected with note ${timestamp}.`;
  return `Rejected ${timestamp}.`;
}

function buildFieldChangeSummary(changedFields: string[]) {
  const count = changedFields.length;
  if (count === 0) return "No field changes";
  return `${count} field correction${count === 1 ? "" : "s"}: ${changedFields.join(", ")}`;
}

function buildDecisionHint(
  isExpanded: boolean,
  pendingFieldChangeCount: number,
  hasCommentDraft: boolean,
  latestFeedback?: ReviewFeedbackEntry
) {
  if (pendingFieldChangeCount > 0 && hasCommentDraft) {
    return `Approving or rejecting now will apply ${pendingFieldChangeCount} edit${pendingFieldChangeCount === 1 ? "" : "s"} and attach your note.`;
  }
  if (pendingFieldChangeCount > 0) {
    return `Approving or rejecting now will apply ${pendingFieldChangeCount} unsaved edit${pendingFieldChangeCount === 1 ? "" : "s"}.`;
  }
  if (hasCommentDraft) return "Approve or reject now to attach the note to your decision.";
  if (isExpanded) return "Leave it untouched unless it needs a correction.";
  if (!latestFeedback) return "Use details only if the summary feels borderline.";
  return `${formatFeedbackAction(latestFeedback.action)} ${formatLocalDateTime(latestFeedback.createdAt)}.`;
}
