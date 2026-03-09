import { useEffect, useTransition } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "./app-shell";
import { CaptureRow, formatTimestamp } from "./capture-card";

export function DashboardShell() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [isSyncPending, startSyncTransition] = useTransition();
  const [isConnectPending, startConnectTransition] = useTransition();
  const dashboard = useQuery(api.dashboard.getDashboardData, isAuthenticated ? {} : "skip");
  const triggerBookmarkSync = useMutation(api.dashboard.triggerBookmarkSync);
  const beginXConnect = useMutation(api.dashboard.beginXConnect);
  const bootstrapLegacyOwnership = useMutation(api.dashboard.bootstrapLegacyOwnership);

  useEffect(() => {
    if (dashboard?.needsLegacyBootstrap) {
      void bootstrapLegacyOwnership({});
    }
  }, [dashboard?.needsLegacyBootstrap, bootstrapLegacyOwnership]);

  if (isLoading || !isAuthenticated || !dashboard) {
    return (
      <main className="dashboard-loading">
        <div className="status-dot" />
        <p>Loading Nougat...</p>
      </main>
    );
  }

  function handleSyncNow() {
    startSyncTransition(async () => {
      await triggerBookmarkSync({});
    });
  }

  function handleConnectX() {
    startConnectTransition(async () => {
      const result = await beginXConnect({});
      window.location.href = result.url;
    });
  }

  return (
    <AppShell
      subtitle="Capture is live. Review, approve, and turn what matters into durable knowledge, tasks, and skills."
      title={dashboard.user.name ?? dashboard.user.email}
    >
      <section className="dashboard-grid">
        <article className="panel">
          <p className="panel-label">X connection</p>
          <h2>{dashboard.x.connected ? `Connected as @${dashboard.x.username ?? "unknown"}` : "Not connected"}</h2>
          <p className="panel-copy">Scopes: {dashboard.x.scopes.join(", ") || "None"}</p>
          <p className="panel-meta">Token expiry: {formatTimestamp(dashboard.x.expiresAt)}</p>
          {!dashboard.x.connected ? (
            <button className="primary-button panel-button" disabled={isConnectPending} onClick={handleConnectX} type="button">
              {isConnectPending ? "Redirecting..." : "Connect X"}
            </button>
          ) : null}
        </article>

        <article className="panel">
          <p className="panel-label">Review queue</p>
          <h2>{dashboard.stats.pendingReviewCount} pending outputs</h2>
          <p className="panel-copy">
            {dashboard.derived.candidateCounts.tasksPending} tasks · {dashboard.derived.candidateCounts.knowledgePending} notes ·{" "}
            {dashboard.derived.candidateCounts.resourcesPending} resources · {dashboard.derived.candidateCounts.skillsPending} skills
          </p>
          <p className="panel-meta">
            Approved: {dashboard.stats.approvedTaskCount} tasks · {dashboard.stats.approvedKnowledgeCount} notes · {dashboard.stats.approvedResourceCount} resources
          </p>
        </article>

        <article className="panel">
          <p className="panel-label">Bookmark sync</p>
          <h2>{dashboard.sync ? `${dashboard.sync.importedCount} imported last run` : "No sync run yet"}</h2>
          <p className="panel-copy">
            {dashboard.sync?.lastError
              ? dashboard.sync.lastError
              : `Last success: ${formatTimestamp(dashboard.sync?.lastSuccessAt)}`}
          </p>
          <div className="hero-actions panel-button-row">
            <button className="primary-button" disabled={isSyncPending} onClick={handleSyncNow} type="button">
              {isSyncPending ? "Queueing sync..." : "Sync X now"}
            </button>
          </div>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-secondary">
        <article className="panel">
          <p className="panel-label">Top tags</p>
          <div className="pill-list">
            {dashboard.derived.topTags.map((tag) => (
              <span className="pill" key={tag.tagId}>
                {tag.name} <strong>{tag.usageCount}</strong>
              </span>
            ))}
            {dashboard.derived.topTags.length === 0 ? <p className="panel-copy">No tags yet.</p> : null}
          </div>
        </article>

        <article className="panel">
          <p className="panel-label">Author tiers</p>
          <div className="stack-list">
            {dashboard.derived.authorSummaries.map((author) => (
              <div className="stack-row" key={author.authorKey}>
                <span>{author.displayName}</span>
                <strong>{author.currentTier}</strong>
              </div>
            ))}
            {dashboard.derived.authorSummaries.length === 0 ? <p className="panel-copy">No author ratings yet.</p> : null}
          </div>
        </article>
      </section>

      <section className="capture-list panel">
        <div className="capture-list-header">
          <div>
            <p className="panel-label">Recent captures</p>
            <h2>Newest activity</h2>
          </div>
        </div>

        <div className="capture-groups">
          <section className="capture-group">
            <ul>
              {dashboard.recentCaptures.map((capture) => (
                <CaptureRow capture={capture} key={capture.id} />
              ))}
            </ul>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
