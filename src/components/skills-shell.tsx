import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRetainedValue } from "../lib/use-retained-value";
import { AppShell } from "./app-shell";
import { ProvenanceBlock } from "./derived-support";

export function SkillsShell() {
  const items = useQuery(api.derived.listSkills, { limit: 100 });
  const visibleItems = useRetainedValue(items);
  const isRefreshing = items === undefined && visibleItems !== undefined;

  return (
    <AppShell subtitle="Approved skill deltas stay source-backed so your agents inherit the sharp language, not generic mush." title="Skills">
      <section aria-busy={isRefreshing} className="panel list-panel panel-loading-shell">
        {!visibleItems ? (
          <div className="dashboard-loading panel-loading">
            <div className="status-dot" />
            <p>Loading skills...</p>
          </div>
        ) : null}
        <div className="list-stack">
          {visibleItems?.map((item) => (
            <article className="list-card" key={item.skillCandidateId}>
              <div className="stack-row">
                <h2>{item.title}</h2>
                <span className="pill">{item.mode}</span>
              </div>
              <p className="panel-copy">{item.details}</p>
              <p className="panel-meta">
                {item.targetSystem}
                {item.targetSkillRef ? ` · ${item.targetSkillRef}` : ""}
              </p>
              <pre className="skill-proposal">{item.proposedChange}</pre>
              <p className="panel-meta">{item.tagSlug ?? "general"}</p>
              <ProvenanceBlock
                approvedAt={item.approvedAt}
                sourceAuthor={item.sourceAuthor}
                sourceCaptureCount={item.sourceCaptureCount}
                sourceUrl={item.sourceUrl}
                why={item.why}
              />
            </article>
          ))}
          {isRefreshing ? <p className="panel-meta subtle-status-row">Refreshing…</p> : null}
          {visibleItems?.length === 0 ? <p className="panel-copy">No approved skill candidates yet.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
