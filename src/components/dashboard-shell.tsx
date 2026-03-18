import { useConvex, useConvexAuth, useMutation, useQuery, type ConvexReactClient } from "convex/react";
import { useDeferredValue, useEffect, useRef, useState, useTransition } from "react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "./app-shell";
import { CaptureCardBody, type DashboardCapture, formatTimestamp } from "./capture-card";
import { ExternalLinkIcon } from "./external-link-icon";
import { ReviewOutputCard } from "./review-output-card";

type CaptureSort = "activity_desc" | "captured_desc" | "captured_asc" | "updated_desc" | "confidence_desc";
type CaptureStatusFilter = "all" | "queued" | "processing" | "enriched" | "partial" | "failed" | "dead_letter";

const CAPTURE_PAGE_SIZE = 20;

type DashboardCaptureQueryArgs = {
  limit: number;
  platform?: string;
  search?: string;
  sort: CaptureSort;
  status: CaptureStatusFilter;
  tag?: string;
};

async function fetchDashboardData(convex: ConvexReactClient) {
  return convex.query(api.dashboard.getDashboardData, {});
}

async function fetchDashboardCaptures(convex: ConvexReactClient, args: DashboardCaptureQueryArgs) {
  return convex.query(api.dashboard.listDashboardCaptures, args);
}

export function DashboardShell() {
  const convex = useConvex();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [isSyncPending, startSyncTransition] = useTransition();
  const [isConnectPending, startConnectTransition] = useTransition();
  const [isCapturePending, startCaptureTransition] = useTransition();
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [reviewCaptureId, setReviewCaptureId] = useState<string | null>(null);
  const [reprocessingCaptureId, setReprocessingCaptureId] = useState<string | null>(null);
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureNote, setCaptureNote] = useState("");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [extensionPairError, setExtensionPairError] = useState<string | null>(null);
  const [extensionPairMessage, setExtensionPairMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<CaptureStatusFilter>("all");
  const [sort, setSort] = useState<CaptureSort>("activity_desc");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(CAPTURE_PAGE_SIZE);
  const [autoLoadArmed, setAutoLoadArmed] = useState(false);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [captureWorkspaceRefreshKey, setCaptureWorkspaceRefreshKey] = useState(0);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof fetchDashboardData>>>();
  const [captureWorkspace, setCaptureWorkspace] = useState<Awaited<ReturnType<typeof fetchDashboardCaptures>>>();
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [isCaptureWorkspaceLoading, setIsCaptureWorkspaceLoading] = useState(false);
  const [dashboardLoadError, setDashboardLoadError] = useState<string | null>(null);
  const [captureWorkspaceLoadError, setCaptureWorkspaceLoadError] = useState<string | null>(null);
  const dashboardRequestRef = useRef(0);
  const captureWorkspaceRequestRef = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const reviewCaptureQueue = useQuery(
    api.derived.getReviewQueue,
    isAuthenticated && reviewCaptureId
      ? {
          captureId: reviewCaptureId,
          limit: 1
        }
      : "skip"
  );
  const triggerBookmarkSync = useMutation(api.dashboard.triggerBookmarkSync);
  const beginXConnect = useMutation(api.dashboard.beginXConnect);
  const bootstrapLegacyOwnership = useMutation(api.dashboard.bootstrapLegacyOwnership);
  const provisionBrowserExtension = useMutation(api.devices.provisionBrowserExtension);
  const captureFromDashboard = useMutation(api.dashboard.captureFromDashboard);
  const requestReprocess = useMutation(api.captures.requestReprocess);

  useEffect(() => {
    if (!isAuthenticated) {
      setDashboard(undefined);
      setIsDashboardLoading(false);
      return;
    }

    const requestId = dashboardRequestRef.current + 1;
    dashboardRequestRef.current = requestId;
    setIsDashboardLoading(true);
    setDashboardLoadError(null);

    void fetchDashboardData(convex)
      .then((result) => {
        if (dashboardRequestRef.current !== requestId) {
          return;
        }

        setDashboard(result);
      })
      .catch((error) => {
        if (dashboardRequestRef.current !== requestId) {
          return;
        }

        setDashboardLoadError(error instanceof Error ? error.message : "Unable to load the dashboard right now.");
        console.error("Failed to load dashboard data", error);
      })
      .finally(() => {
        if (dashboardRequestRef.current === requestId) {
          setIsDashboardLoading(false);
        }
      });
  }, [convex, dashboardRefreshKey, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCaptureWorkspace(undefined);
      setIsCaptureWorkspaceLoading(false);
      return;
    }

    const requestId = captureWorkspaceRequestRef.current + 1;
    captureWorkspaceRequestRef.current = requestId;
    setIsCaptureWorkspaceLoading(true);
    setCaptureWorkspaceLoadError(null);

    void fetchDashboardCaptures(convex, {
      limit: visibleCount,
      platform: platformFilter,
      search: deferredSearch || undefined,
      sort,
      status: statusFilter,
      tag: selectedTag ?? undefined
    })
      .then((result) => {
        if (captureWorkspaceRequestRef.current !== requestId) {
          return;
        }

        setCaptureWorkspace(result);
      })
      .catch((error) => {
        if (captureWorkspaceRequestRef.current !== requestId) {
          return;
        }

        setCaptureWorkspaceLoadError(error instanceof Error ? error.message : "Unable to load captures right now.");
        console.error("Failed to load dashboard captures", error);
      })
      .finally(() => {
        if (captureWorkspaceRequestRef.current === requestId) {
          setIsCaptureWorkspaceLoading(false);
        }
      });
  }, [captureWorkspaceRefreshKey, convex, deferredSearch, isAuthenticated, platformFilter, selectedTag, sort, statusFilter, visibleCount]);

  useEffect(() => {
    if (dashboard?.needsLegacyBootstrap) {
      void bootstrapLegacyOwnership({}).then(() => {
        setDashboardRefreshKey((current) => current + 1);
        setCaptureWorkspaceRefreshKey((current) => current + 1);
      });
    }
  }, [bootstrapLegacyOwnership, dashboard?.needsLegacyBootstrap]);

  useEffect(() => {
    function handlePairingRequest(event: MessageEvent) {
      if (event.source !== window) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== "object" || data.source !== "nougat-extension-bridge" || data.type !== "NOUGAT_EXTENSION_PAIRING_REQUEST") {
        return;
      }

      const requestId = typeof data.requestId === "string" ? data.requestId : null;
      if (!requestId) {
        return;
      }

      const payload = typeof data.payload === "object" && data.payload ? data.payload : {};
      const currentDeviceId = typeof payload.deviceId === "string" ? payload.deviceId : undefined;
      const sourceApp = typeof payload.sourceApp === "string" ? payload.sourceApp : undefined;

      void (async () => {
        try {
          const result = await provisionBrowserExtension({
            currentDeviceId,
            sourceApp
          });
          setExtensionPairError(null);
          setExtensionPairMessage(
            result.claimedCaptures > 0
              ? `Browser extension connected. Claimed ${result.claimedCaptures} existing capture${result.claimedCaptures === 1 ? "" : "s"}.`
              : "Browser extension connected."
          );
          window.postMessage(
            {
              ok: true,
              payload: result,
              requestId,
              source: "nougat-app",
              type: "NOUGAT_EXTENSION_PAIRING_RESPONSE"
            },
            window.location.origin
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to connect the browser extension.";
          setExtensionPairMessage(null);
          setExtensionPairError(message);
          window.postMessage(
            {
              error: message,
              ok: false,
              requestId,
              source: "nougat-app",
              type: "NOUGAT_EXTENSION_PAIRING_RESPONSE"
            },
            window.location.origin
          );
        }
      })();
    }

    window.addEventListener("message", handlePairingRequest);
    return () => window.removeEventListener("message", handlePairingRequest);
  }, [provisionBrowserExtension]);

  useEffect(() => {
    setVisibleCount(CAPTURE_PAGE_SIZE);
    setAutoLoadArmed(false);
  }, [deferredSearch, platformFilter, selectedTag, sort, statusFilter]);

  useEffect(() => {
    setAutoLoadArmed(false);
  }, [captureWorkspace?.items.length]);

  useEffect(() => {
    if (!captureWorkspace?.hasMore || autoLoadArmed) {
      return;
    }

    const node = loadMoreRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) {
          return;
        }

        setAutoLoadArmed(true);
        setVisibleCount((current) => current + CAPTURE_PAGE_SIZE);
      },
      {
        rootMargin: "240px 0px"
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [autoLoadArmed, captureWorkspace?.hasMore]);

  useEffect(() => {
    if (!isCaptureModalOpen) {
      return;
    }

    captureInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCaptureModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCaptureModalOpen]);

  useEffect(() => {
    if (!reviewCaptureId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReviewCaptureId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [reviewCaptureId]);

  useEffect(() => {
    const isModalOpen = isCaptureModalOpen || reviewCaptureId !== null;
    document.body.classList.toggle("modal-open", isModalOpen);

    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [isCaptureModalOpen, reviewCaptureId]);

  if (isLoading || !isAuthenticated) {
    return (
      <main className="dashboard-loading">
        <div className="status-dot" />
        <p>Loading dashboard...</p>
      </main>
    );
  }

  const visibleDashboard = dashboard;
  const visibleCaptureWorkspace = captureWorkspace;
  const isRefreshingWorkspace = isDashboardLoading || isCaptureWorkspaceLoading;

  if (!visibleDashboard || !visibleCaptureWorkspace) {
    return (
      <AppShell chromeStyle="workspace">
        <section className="panel list-panel panel-loading-shell" aria-busy="true">
          <div className="dashboard-loading panel-loading">
            <div className="status-dot" />
            <p>{dashboardLoadError ?? captureWorkspaceLoadError ?? "Loading dashboard..."}</p>
          </div>
        </section>
      </AppShell>
    );
  }

  function handleSyncNow() {
    startSyncTransition(async () => {
      await triggerBookmarkSync({});
      setDashboardRefreshKey((current) => current + 1);
    });
  }

  function handleConnectX() {
    startConnectTransition(async () => {
      const result = await beginXConnect({});
      window.location.href = result.url;
    });
  }

  function handleDrop(event: React.DragEvent<HTMLFormElement>) {
    event.preventDefault();

    const uriList = event.dataTransfer.getData("text/uri-list").trim();
    const plainText = event.dataTransfer.getData("text/plain").trim();
    const droppedUrl = uriList || plainText;

    if (droppedUrl && /^https?:\/\//i.test(droppedUrl)) {
      setCaptureError(null);
      setCaptureUrl(droppedUrl);
      return;
    }

    const imageFile = [...event.dataTransfer.files].find((file) => file.type.startsWith("image/"));
    if (imageFile) {
      setCaptureError("Local image drop needs storage support before it can be ingested. Paste the source URL for now.");
      return;
    }

    setCaptureError("Drop a URL from the browser, or paste one directly.");
  }

  function handleCaptureSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUrl = captureUrl.trim();

    if (!normalizedUrl) {
      setCaptureError("Paste a URL to capture.");
      return;
    }

    setCaptureError(null);
    startCaptureTransition(async () => {
      try {
        await captureFromDashboard({
          note: captureNote.trim() || undefined,
          url: normalizedUrl
        });
        setDashboardRefreshKey((current) => current + 1);
        setCaptureWorkspaceRefreshKey((current) => current + 1);
        setCaptureUrl("");
        setCaptureNote("");
        setIsCaptureModalOpen(false);
      } catch (error) {
        setCaptureError(error instanceof Error ? error.message : "Unable to capture that URL.");
      }
    });
  }

  async function handleReprocess(captureId: string) {
    setReprocessingCaptureId(captureId);
    try {
      await requestReprocess({ captureId });
      setDashboardRefreshKey((current) => current + 1);
      setCaptureWorkspaceRefreshKey((current) => current + 1);
    } finally {
      setReprocessingCaptureId(null);
    }
  }

  return (
    <AppShell chromeStyle="workspace">
      <section className="dashboard-workspace">
        <aside className="dashboard-sidebar">
          <article className="panel sidebar-panel">
            <div className="sidebar-panel-header">
              <div>
                <p className="panel-label">Top tags</p>
                <h2>Filter the inbox</h2>
              </div>
            </div>
            <div className="tag-filter-list">
              <button
                className={selectedTag ? "tag-filter" : "tag-filter active"}
                onClick={() => setSelectedTag(null)}
                type="button"
              >
                All captures
              </button>
              {visibleDashboard.derived.topTags.map((tag) => (
                <button
                  className={selectedTag === tag.slug ? "tag-filter active" : "tag-filter"}
                  key={tag.tagId}
                  onClick={() => setSelectedTag((current) => (current === tag.slug ? null : tag.slug))}
                  type="button"
                >
                  <span>{tag.name}</span>
                  <strong>{tag.usageCount}</strong>
                </button>
              ))}
            </div>
          </article>

          <article className="panel sidebar-panel">
            <div className="sidebar-panel-header">
              <div>
                <p className="panel-label">System monitor</p>
                <h2>Keep the pipes healthy</h2>
              </div>
            </div>
            <div className="monitor-stack">
              <div className="monitor-row">
                <span>X connection</span>
                <strong>{visibleDashboard.x.connected ? `@${visibleDashboard.x.username ?? "connected"}` : "Not connected"}</strong>
              </div>
              <div className="monitor-row">
                <span>Last success</span>
                <strong>{formatTimestamp(visibleDashboard.sync?.lastSuccessAt)}</strong>
              </div>
              <div className="monitor-row">
                <span>Imported last run</span>
                <strong>{visibleDashboard.sync?.importedCount ?? 0}</strong>
              </div>
              {visibleDashboard.stats.failedCount > 0 ? (
                <div className="monitor-row">
                  <span>Failed captures</span>
                  <strong>{visibleDashboard.stats.failedCount}</strong>
                </div>
              ) : null}
            </div>
            <div className="sidebar-action-row">
              {!visibleDashboard.x.connected ? (
                <button className="primary-button" disabled={isConnectPending} onClick={handleConnectX} type="button">
                  {isConnectPending ? "Redirecting..." : "Connect X"}
                </button>
              ) : null}
              <button className="secondary-button" disabled={isSyncPending} onClick={handleSyncNow} type="button">
                {isSyncPending ? "Queueing sync..." : "Run X sync"}
              </button>
            </div>
            <p className="panel-copy">To pair the browser extension, keep this dashboard tab open and use the extension popup.</p>
            {extensionPairMessage ? <p className="panel-meta">{extensionPairMessage}</p> : null}
            {extensionPairError ? <p className="monitor-error">{extensionPairError}</p> : null}
            {visibleDashboard.sync?.lastError ? <p className="monitor-error">{visibleDashboard.sync.lastError}</p> : null}
          </article>
        </aside>

        <div className="dashboard-main">
          <section className="panel capture-feed-panel">
            <div className="capture-feed-header">
              <div>
                <p className="panel-label">All captures</p>
                <h2>Browse, search, and keep up</h2>
              </div>
              <div className="capture-feed-actions">
                {isRefreshingWorkspace ? <span className="subtle-status">Refreshing…</span> : null}
                <button className="primary-button" onClick={() => setIsCaptureModalOpen(true)} type="button">
                  Capture
                </button>
              </div>
            </div>

            <div className="capture-toolbar-controls">
              <label className="capture-field capture-field-search">
                <span>Search by topic</span>
                <input
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cold email, GTM, memory systems, outreach..."
                  type="search"
                  value={search}
                />
              </label>

              <label className="capture-field">
                <span>Platform</span>
                <select onChange={(event) => setPlatformFilter(event.target.value)} value={platformFilter}>
                  <option value="all">All platforms</option>
                  {visibleCaptureWorkspace.availablePlatforms.map((platform) => (
                    <option key={platform} value={platform}>
                      {formatPlatform(platform)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="capture-field">
                <span>Status</span>
                <select onChange={(event) => setStatusFilter(event.target.value as CaptureStatusFilter)} value={statusFilter}>
                  <option value="all">All statuses</option>
                  <option value="queued">Queued</option>
                  <option value="processing">Processing</option>
                  <option value="enriched">Enriched</option>
                  <option value="partial">Partial</option>
                  <option value="failed">Failed</option>
                  <option value="dead_letter">Dead letter</option>
                </select>
              </label>

              <label className="capture-field">
                <span>Sort</span>
                <select onChange={(event) => setSort(event.target.value as CaptureSort)} value={sort}>
                  <option value="activity_desc">Recent activity</option>
                  <option value="captured_desc">Newest captured</option>
                  <option value="captured_asc">Oldest captured</option>
                  <option value="updated_desc">Recently updated</option>
                  <option value="confidence_desc">Best confidence</option>
                </select>
              </label>
            </div>

            <div aria-busy={isRefreshingWorkspace} className="capture-feed">
              {visibleCaptureWorkspace.items.map((capture) => (
                <article className="capture-workspace-row" key={capture.captureId}>
                  <div className="capture-workspace-main">
                    <div className="capture-workspace-heading">
                      <p className="capture-workspace-eyebrow">
                        {formatPlatform(capture.platform)} · {formatTimestamp(capture.sourcedAt)}
                        {capture.postedAt ? ` · Posted ${formatTimestamp(capture.postedAt)}` : ""}
                        {capture.syncBatchAt ? ` · Sync batch ${formatTimestamp(capture.syncBatchAt)}` : ""}
                      </p>
                      <div className="capture-badge-row">
                        <StatusBadge status={capture.status} />
                      </div>
                    </div>

                    {capture.xPost ? (
                      <CaptureCardBody capture={toDashboardCapture(capture)} showFooter={false} showOpenLink={false} />
                    ) : (
                      <>
                        <div className="capture-workspace-copy">
                          <h3>{capture.title}</h3>
                        </div>
                        <p className="panel-copy">
                          {capture.author ? `${capture.author} · ` : ""}
                          {capture.excerpt ?? capture.canonicalUrl}
                        </p>

                        <p className="panel-meta">{capture.captureMethod.replaceAll("_", " ")}</p>
                      </>
                    )}

                    {capture.tags.length ? (
                      <div className="capture-tag-row">
                        {capture.tags.map((tag: { name: string; slug: string }) => (
                          <button
                            className={selectedTag === tag.slug ? "tag-filter active compact" : "tag-filter compact"}
                            key={`${capture.captureId}-${tag.slug}`}
                            onClick={() => setSelectedTag((current) => (current === tag.slug ? null : tag.slug))}
                            type="button"
                          >
                            {tag.name}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {capture.lastError ? <p className="monitor-error">Last error: {capture.lastError}</p> : null}
                  </div>

                  <div className="capture-workspace-actions">
                    {capture.needsReview ? (
                      <button className="secondary-button" onClick={() => setReviewCaptureId(capture.captureId)} type="button">
                        Review outputs
                      </button>
                    ) : null}
                    <a
                      aria-label="Open source"
                      className="secondary-button capture-open-link"
                      href={capture.canonicalUrl}
                      rel="noreferrer"
                      target="_blank"
                      title="Open source"
                    >
                      <ExternalLinkIcon className="button-icon" />
                    </a>
                    {capture.status === "failed" || capture.status === "dead_letter" ? (
                      <button
                        className="primary-button"
                        disabled={reprocessingCaptureId === capture.captureId}
                        onClick={() => void handleReprocess(capture.captureId)}
                        type="button"
                      >
                        {reprocessingCaptureId === capture.captureId ? "Requeueing..." : "Reprocess"}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}

              {visibleCaptureWorkspace.items.length === 0 ? (
                <div className="empty-state">
                  <h3>No captures match the current view.</h3>
                  <p className="panel-copy">Try another tag, status, or search phrase.</p>
                </div>
              ) : null}
            </div>

            <div className="capture-load-sentinel" ref={loadMoreRef}>
              {visibleCaptureWorkspace.hasMore ? (
                <p className="panel-meta">{isRefreshingWorkspace ? "Refreshing captures…" : "Loading more captures as you scroll."}</p>
              ) : null}
            </div>
          </section>
        </div>
      </section>

      {isCaptureModalOpen ? (
        <div aria-modal="true" className="capture-modal-backdrop" role="dialog">
          <div className="capture-modal">
            <div className="capture-modal-header">
              <h2>Capture</h2>
              <button className="secondary-button" onClick={() => setIsCaptureModalOpen(false)} type="button">
                Close
              </button>
            </div>
            <form className="capture-modal-form" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} onSubmit={handleCaptureSubmit}>
              <label className="capture-field capture-field-wide">
                <span>URL</span>
                <input
                  onChange={(event) => setCaptureUrl(event.target.value)}
                  placeholder="Paste a URL or drop one here"
                  ref={captureInputRef}
                  type="url"
                  value={captureUrl}
                />
              </label>
              <label className="capture-field">
                <span>Context note</span>
                <input
                  onChange={(event) => setCaptureNote(event.target.value)}
                  placeholder="Optional"
                  type="text"
                  value={captureNote}
                />
              </label>
              {captureError ? <p className="auth-error">{captureError}</p> : null}
              <div className="capture-modal-actions">
                <button className="secondary-button" onClick={() => setIsCaptureModalOpen(false)} type="button">
                  Cancel
                </button>
                <button className="primary-button" disabled={isCapturePending} type="submit">
                  {isCapturePending ? "Capturing..." : "Capture"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {reviewCaptureId ? (
        <div aria-modal="true" className="capture-modal-backdrop review-modal-backdrop" role="dialog">
          <div className="capture-modal review-modal">
            <div className="capture-modal-header">
              <h2>Review outputs</h2>
              <button className="secondary-button" onClick={() => setReviewCaptureId(null)} type="button">
                Close
              </button>
            </div>
            <div className="review-modal-body">
              {!reviewCaptureQueue ? (
                <div className="dashboard-loading review-modal-loading">
                  <div className="status-dot" />
                  <p>Loading outputs...</p>
                </div>
              ) : reviewCaptureQueue.items[0] ? (
                <ReviewOutputCard item={reviewCaptureQueue.items[0]} />
              ) : (
                <article className="panel empty-state">
                  <h2>No pending outputs</h2>
                  <p className="panel-copy">This capture has no reviewable outputs right now.</p>
                </article>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "enriched") {
    return null;
  }

  return <span className={`status-badge status-${status}`}>{formatStatus(status)}</span>;
}

function formatPlatform(platform: string) {
  if (platform === "x") return "X";
  return platform.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function toDashboardCapture(capture: {
  author: string | null;
  canonicalUrl: string;
  captureId: string;
  captureMethod: string;
  platform: string;
  postedAt: number | null;
  sourcedAt: number;
  status: string;
  syncBatchAt: number | null;
  title: string;
  xPost: DashboardCapture["xPost"];
}): DashboardCapture {
  return {
    author: capture.author,
    canonicalUrl: capture.canonicalUrl,
    captureMethod: capture.captureMethod,
    id: capture.captureId,
    platform: capture.platform,
    postedAt: capture.postedAt,
    sourcedAt: capture.sourcedAt,
    status: capture.status,
    syncBatchAt: capture.syncBatchAt,
    title: capture.title,
    xPost: capture.xPost
  };
}
