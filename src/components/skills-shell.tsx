import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "./app-shell";
import { ProvenanceBlock, RelatedViewpoints } from "./derived-support";

export function SkillsShell() {
  const items = useQuery(api.derived.listSkills, { limit: 100 });

  if (!items) {
    return (
      <main className="dashboard-loading">
        <div className="status-dot" />
        <p>Loading skills...</p>
      </main>
    );
  }

  return (
    <AppShell subtitle="Approved skill deltas stay source-backed so your agents inherit the sharp language, not generic mush." title="Skills">
      <section className="panel list-panel">
        <div className="list-stack">
          {items.map((item) => (
            <article className="list-card" key={item.skillCandidateId}>
              <div className="stack-row">
                <h2>{item.title}</h2>
                <span className="pill">{item.targetSystem}</span>
              </div>
              <p className="panel-copy">{item.details}</p>
              <pre className="skill-proposal">{item.proposedChange}</pre>
              <p className="panel-meta">{item.tagSlug ?? "general"}</p>
              <ProvenanceBlock
                approvedAt={item.approvedAt}
                justification={item.justification}
                sourceAuthor={item.sourceAuthor}
                sourceCaptureCount={item.sourceCaptureCount}
                sourceUrl={item.sourceUrl}
              />
              <RelatedViewpoints items={item.relatedViewpoints} />
            </article>
          ))}
          {items.length === 0 ? <p className="panel-copy">No approved skill candidates yet.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
