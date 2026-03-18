import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRetainedValue } from "../lib/use-retained-value";
import { AppShell } from "./app-shell";
import { ProvenanceBlock } from "./derived-support";

export function ResourcesShell() {
  const items = useQuery(api.derived.listResources, { limit: 100 });
  const visibleItems = useRetainedValue(items);
  const isRefreshing = items === undefined && visibleItems !== undefined;

  return (
    <AppShell
      subtitle="Resources are tools, apps, repos, prompts, plugins, templates, and design files that should not clutter the notes."
      title="Resources"
    >
      <section aria-busy={isRefreshing} className="panel list-panel panel-loading-shell">
        {!visibleItems ? (
          <div className="dashboard-loading panel-loading">
            <div className="status-dot" />
            <p>Loading resources...</p>
          </div>
        ) : null}
        <div className="list-stack">
          {visibleItems?.map((item) => (
            <article className="list-card" key={item.resourceId}>
              <div className="stack-row">
                <h2>{item.name}</h2>
                <span className="pill">{item.resourceType}</span>
              </div>
              <p className="panel-copy">{item.details}</p>
              <p className="panel-meta">
                {item.company ?? item.creator ?? "Unknown creator"} · {item.tagSlug ?? "general"}
              </p>
              <ProvenanceBlock
                approvedAt={item.approvedAt}
                sourceAuthor={item.sourceAuthor}
                sourceCaptureCount={item.sourceCaptureCount}
                sourceLabel="Open source mention"
                sourceUrl={item.sourceUrl}
                why={item.why}
              />
              {item.useCases.length ? (
                <div className="pill-list">
                  {item.useCases.map((useCase) => (
                    <span className="pill" key={useCase}>
                      {useCase}
                    </span>
                  ))}
                </div>
              ) : null}
              <a href={item.resourceUrl} rel="noreferrer" target="_blank">
                Open resource
              </a>
            </article>
          ))}
          {isRefreshing ? <p className="panel-meta subtle-status-row">Refreshing…</p> : null}
          {visibleItems?.length === 0 ? <p className="panel-copy">No approved resources yet.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
