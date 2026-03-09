import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "./app-shell";
import { ProvenanceBlock, RelatedViewpoints, ViewpointTopicGroups } from "./derived-support";

export function KnowledgeShell() {
  const items = useQuery(api.derived.listKnowledge, { limit: 100 });
  const topics = useQuery(api.derived.listViewpointTopics, { limit: 100 });

  if (!items || !topics) {
    return (
      <main className="dashboard-loading">
        <div className="status-dot" />
        <p>Loading knowledge...</p>
      </main>
    );
  }

  return (
    <AppShell subtitle="Approved notes keep source texture, provenance, and quotes instead of flattening everything into generic advice." title="Knowledge">
      <ViewpointTopicGroups topics={topics} />
      <section className="panel list-panel">
        <div className="list-stack">
          {items.map((item) => (
            <article className="list-card" key={item.knowledgeItemId}>
              <div className="stack-row">
                <h2>{item.title}</h2>
                {item.tagSlug ? <span className="pill">{item.tagSlug}</span> : null}
              </div>
              <p className="panel-copy prewrap">{item.content}</p>
              {item.sourceQuote ? <blockquote className="source-quote">{item.sourceQuote}</blockquote> : null}
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
          {items.length === 0 ? <p className="panel-copy">No approved knowledge items yet.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
