import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRetainedValue } from "../lib/use-retained-value";
import { AppShell } from "./app-shell";
import { ReviewOutputCard, type ReviewQueueItem } from "./review-output-card";

export function ReviewQueueShell() {
  const queue = useQuery(api.derived.getReviewQueue, { limit: 12 });
  const summary = useQuery(api.derived.getDerivedSummary, {});
  const visibleQueue = useRetainedValue(queue);
  const visibleSummary = useRetainedValue(summary);
  const [activeCaptureId, setActiveCaptureId] = useState<string | null>(null);
  const isRefreshing = (queue === undefined && visibleQueue !== undefined) || (summary === undefined && visibleSummary !== undefined);

  useEffect(() => {
    if (!visibleQueue?.items.length) {
      setActiveCaptureId(null);
      return;
    }

    setActiveCaptureId((current) =>
      current && visibleQueue.items.some((item: ReviewQueueItem) => item.capture.id === current) ? current : visibleQueue.items[0].capture.id
    );
  }, [visibleQueue]);

  const activeItem = useMemo(() => {
    if (!visibleQueue?.items.length) return null;
    return visibleQueue.items.find((item: ReviewQueueItem) => item.capture.id === activeCaptureId) ?? visibleQueue.items[0];
  }, [activeCaptureId, visibleQueue]);

  return (
    <AppShell
      subtitle="Review each capture in context. Save comments and edits with visible confirmation, and only approve outputs that deserve to stay in Nougat."
      title="Review queue"
    >
      {!visibleQueue || !visibleSummary ? (
        <section className="panel list-panel panel-loading-shell" aria-busy="true">
          <div className="dashboard-loading panel-loading">
            <div className="status-dot" />
            <p>Loading review queue...</p>
          </div>
        </section>
      ) : null}

      {visibleQueue && visibleSummary ? (
        <section aria-busy={isRefreshing} className="review-shell-grid">
          <aside className="panel review-queue-sidebar">
            <div className="review-sidebar-header">
              <div>
                <p className="panel-label">Review queue</p>
                <h2>{visibleQueue.items.length} captures waiting</h2>
              </div>
              {isRefreshing ? <p className="panel-meta subtle-status-row">Refreshing…</p> : null}
            </div>

            <div className="review-sidebar-summary">
              <span className="review-sidebar-pill">Tags {visibleSummary.candidateCounts.tagsPending}</span>
              <span className="review-sidebar-pill">Notes {visibleSummary.candidateCounts.notesPending}</span>
              <span className="review-sidebar-pill">Tasks {visibleSummary.candidateCounts.tasksPending}</span>
              <span className="review-sidebar-pill">Resources {visibleSummary.candidateCounts.resourcesPending}</span>
              <span className="review-sidebar-pill">Skills {visibleSummary.candidateCounts.skillsPending}</span>
              <span className="review-sidebar-pill">Ratings {visibleSummary.candidateCounts.authorRatingsPending}</span>
            </div>

            <div className="review-sidebar-list">
              {visibleQueue.items.map((item: ReviewQueueItem) => {
                const isActive = item.capture.id === activeCaptureId;
                return (
                  <button
                    className={`review-sidebar-item ${isActive ? "is-active" : ""}`}
                    key={item.capture.id}
                    onClick={() => setActiveCaptureId(item.capture.id)}
                    type="button"
                  >
                    <div className="review-sidebar-item-top">
                      <strong>{item.capture.author ?? "Unknown"}</strong>
                      <span className="review-sidebar-count">{item.pendingCount}</span>
                    </div>
                    <p className="review-sidebar-title">{item.capture.title}</p>
                    <p className="review-sidebar-meta">
                      Pending {item.statusCounts.pending} · Saved {item.statusCounts.saved} · Approved {item.statusCounts.approved}
                    </p>
                  </button>
                );
              })}
            </div>

            {visibleSummary.authorSummaries.length ? (
              <div className="review-sidebar-footer">
                <p className="panel-label">Author tiers</p>
                <div className="review-author-list">
                  {visibleSummary.authorSummaries.map((author: { authorKey: string; currentTier: string; displayName: string }) => (
                    <div className="review-author-row" key={author.authorKey}>
                      <span>{author.displayName}</span>
                      <strong>{author.currentTier}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          <div className="review-focus-stage">
            {activeItem ? (
              <ReviewOutputCard item={activeItem} />
            ) : (
              <article className="panel empty-state">
                <h2>No pending review items</h2>
                <p className="panel-copy">New captures will land here once they finish enrichment and derived evaluation.</p>
              </article>
            )}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
