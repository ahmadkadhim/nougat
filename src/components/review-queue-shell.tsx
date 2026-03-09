import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "./app-shell";
import { CaptureRow } from "./capture-card";

export function ReviewQueueShell() {
  const queue = useQuery(api.derived.getReviewQueue, { limit: 12 });
  const reviewEntity = useMutation(api.derived.reviewEntity);

  if (!queue) {
    return (
      <main className="dashboard-loading">
        <div className="status-dot" />
        <p>Loading review queue...</p>
      </main>
    );
  }

  return (
    <AppShell
      subtitle="Inspect the source, keep the strong phrasing, fix weak tags and tasks, and approve only what should become durable."
      title="Review queue"
    >
      <section className="review-stack">
        {queue.items.map((item) => (
          <article className="panel review-card" key={item.capture.id}>
            <div className="review-card-header">
              <div>
                <p className="panel-label">Pending review</p>
                <h2>{item.pendingCount} outputs from one capture</h2>
              </div>
            </div>

            <ul className="review-capture-list">
              <CaptureRow capture={item.capture} />
            </ul>

            <div className="review-grid">
              <ReviewSection title="Tags">
                {item.tags.map((tag: any) => (
                  <EditableEntityCard
                    entityId={tag.id}
                    entityType="tag_assignment"
                    fields={[
                      { key: "name", label: "Tag", type: "text", value: tag.name },
                      { key: "role", label: "Role", type: "select", value: tag.role, options: ["primary", "secondary"] },
                      { key: "justification", label: "Why", type: "textarea", value: tag.justification }
                    ]}
                    key={tag.id}
                    reviewEntity={reviewEntity}
                    summary={`Confidence ${Math.round(tag.confidence * 100)}%`}
                  />
                ))}
              </ReviewSection>

              <ReviewSection title="Knowledge notes">
                {item.knowledgeItems.map((knowledge: any) => (
                  <EditableEntityCard
                    entityId={knowledge.id}
                    entityType="knowledge_item"
                    fields={[
                      { key: "title", label: "Title", type: "text", value: knowledge.title },
                      { key: "content", label: "Note", type: "textarea", value: knowledge.content },
                      { key: "sourceQuote", label: "Quote", type: "textarea", value: knowledge.sourceQuote },
                      { key: "justification", label: "Why", type: "textarea", value: knowledge.justification }
                    ]}
                    key={knowledge.id}
                    reviewEntity={reviewEntity}
                    summary={`Confidence ${Math.round(knowledge.confidence * 100)}%`}
                  />
                ))}
              </ReviewSection>

              <ReviewSection title="Task candidates">
                {item.taskCandidates.map((task: any) => (
                  <EditableEntityCard
                    entityId={task.id}
                    entityType="task_candidate"
                    fields={[
                      { key: "title", label: "Title", type: "text", value: task.title },
                      { key: "details", label: "Task", type: "textarea", value: task.details },
                      { key: "assigneeType", label: "Assignee", type: "select", value: task.assigneeType, options: ["user", "agent"] },
                      { key: "suggestedAction", label: "Suggested action", type: "textarea", value: task.suggestedAction },
                      { key: "justification", label: "Why", type: "textarea", value: task.justification }
                    ]}
                    key={task.id}
                    reviewEntity={reviewEntity}
                    summary={`Confidence ${Math.round(task.confidence * 100)}%`}
                  />
                ))}
              </ReviewSection>

              <ReviewSection title="Skill candidates">
                {item.skillCandidates.map((skill: any) => (
                  <EditableEntityCard
                    entityId={skill.id}
                    entityType="skill_candidate"
                    fields={[
                      { key: "title", label: "Title", type: "text", value: skill.title },
                      { key: "details", label: "Details", type: "textarea", value: skill.details },
                      { key: "targetSystem", label: "Target", type: "text", value: skill.targetSystem },
                      { key: "proposedChange", label: "Proposed change", type: "textarea", value: skill.proposedChange },
                      { key: "justification", label: "Why", type: "textarea", value: skill.justification }
                    ]}
                    key={skill.id}
                    reviewEntity={reviewEntity}
                    summary={`Confidence ${Math.round(skill.confidence * 100)}%`}
                  />
                ))}
              </ReviewSection>

              <ReviewSection title="Resources">
                {item.resources.map((resource: any) => (
                  <EditableEntityCard
                    entityId={resource.id}
                    entityType="resource"
                    fields={[
                      { key: "name", label: "Name", type: "text", value: resource.name },
                      { key: "resourceType", label: "Type", type: "text", value: resource.resourceType },
                      { key: "resourceUrl", label: "URL", type: "text", value: resource.resourceUrl },
                      { key: "company", label: "Company", type: "text", value: resource.company },
                      { key: "creator", label: "Creator", type: "text", value: resource.creator },
                      { key: "useCases", label: "Use cases (comma-separated)", type: "text", value: resource.useCases.join(", ") },
                      { key: "details", label: "Details", type: "textarea", value: resource.details },
                      { key: "justification", label: "Why", type: "textarea", value: resource.justification }
                    ]}
                    key={resource.id}
                    reviewEntity={reviewEntity}
                    summary={`Confidence ${Math.round(resource.confidence * 100)}%`}
                  />
                ))}
              </ReviewSection>

              <ReviewSection title="Author rating">
                {item.authorRatings.map((rating: any) => (
                  <EditableEntityCard
                    entityId={rating.id}
                    entityType="author_rating"
                    fields={[
                      { key: "suggestedTier", label: "Tier", type: "select", value: rating.suggestedTier, options: ["S", "A", "B", "C", "D", "E", "F"] },
                      { key: "trustScore", label: "Trust", type: "number", value: rating.trustScore },
                      { key: "signalScore", label: "Signal", type: "number", value: rating.signalScore },
                      { key: "hypeScore", label: "Hype", type: "number", value: rating.hypeScore },
                      { key: "relevanceScore", label: "Relevance", type: "number", value: rating.relevanceScore },
                      { key: "justification", label: "Why", type: "textarea", value: rating.justification }
                    ]}
                    key={rating.id}
                    reviewEntity={reviewEntity}
                    summary={rating.sourceAuthor}
                  />
                ))}
              </ReviewSection>

              <ReviewSection title="Viewpoints">
                {item.viewpoints.map((viewpoint: any) => (
                  <EditableEntityCard
                    entityId={viewpoint.id}
                    entityType="source_viewpoint"
                    fields={[
                      { key: "topic", label: "Topic", type: "text", value: viewpoint.topic },
                      { key: "stance", label: "Stance", type: "select", value: viewpoint.stance, options: ["do", "avoid", "caution", "tradeoff"] },
                      { key: "claim", label: "Claim", type: "textarea", value: viewpoint.claim },
                      { key: "rationale", label: "Rationale", type: "textarea", value: viewpoint.rationale },
                      { key: "evidenceQuote", label: "Evidence quote", type: "textarea", value: viewpoint.evidenceQuote },
                      { key: "justification", label: "Why", type: "textarea", value: viewpoint.justification }
                    ]}
                    key={viewpoint.id}
                    reviewEntity={reviewEntity}
                    summary={`Confidence ${Math.round(viewpoint.confidence * 100)}%`}
                  />
                ))}
              </ReviewSection>
            </div>
          </article>
        ))}
        {queue.items.length === 0 ? (
          <article className="panel empty-state">
            <h2>No pending review items</h2>
            <p className="panel-copy">New captures will land here once they finish enrichment and derived evaluation.</p>
          </article>
        ) : null}
      </section>
    </AppShell>
  );
}

function ReviewSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="review-section">
      <div className="review-section-header">
        <p className="panel-label">{title}</p>
      </div>
      <div className="review-section-body">{children}</div>
    </section>
  );
}

function EditableEntityCard({
  entityId,
  entityType,
  fields,
  reviewEntity,
  summary
}: {
  entityId: string;
  entityType: "tag_assignment" | "knowledge_item" | "task_candidate" | "skill_candidate" | "resource" | "author_rating" | "source_viewpoint";
  fields: Array<{ key: string; label: string; options?: string[]; type: "text" | "textarea" | "select" | "number"; value: any }>;
  reviewEntity: any;
  summary?: string;
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.value ?? ""]))
  );
  const [comment, setComment] = useState("");
  const [isPending, setPending] = useState(false);

  async function runAction(action: "save" | "approve" | "reject") {
    setPending(true);
    try {
      const normalizedUpdates = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, typeof value === "string" && /^\d+(\.\d+)?$/.test(value) ? Number(value) : value])
      );
      await reviewEntity({
        entityType,
        entityId,
        action,
        updates: normalizedUpdates,
        comment: comment || undefined
      });
      setComment("");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="review-entity-card">
      {summary ? <p className="review-entity-summary">{summary}</p> : null}
      <div className="review-field-grid">
        {fields.map((field) => (
          <label className="review-field" key={field.key}>
            <span>{field.label}</span>
            {field.type === "textarea" ? (
              <textarea
                rows={field.key === "content" || field.key === "proposedChange" ? 5 : 3}
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

      <label className="review-field">
        <span>Feedback note</span>
        <textarea rows={2} value={comment} onChange={(event) => setComment(event.target.value)} />
      </label>

      <div className="review-actions">
        <button className="secondary-button" disabled={isPending} onClick={() => runAction("save")} type="button">
          Save edits
        </button>
        <button className="primary-button" disabled={isPending} onClick={() => runAction("approve")} type="button">
          Approve
        </button>
        <button className="danger-button" disabled={isPending} onClick={() => runAction("reject")} type="button">
          Reject
        </button>
      </div>
    </article>
  );
}
