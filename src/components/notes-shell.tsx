import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRetainedValue } from "../lib/use-retained-value";
import { AppShell } from "./app-shell";
import { ProvenanceBlock } from "./derived-support";

export function NotesShell() {
  const items = useQuery(api.derived.listNotes, { limit: 100 });
  const visibleItems = useRetainedValue(items);
  const isRefreshing = items === undefined && visibleItems !== undefined;

  return (
    <AppShell subtitle="Approved notes keep the durable claim, quote, and provenance without pretending everything must agree." title="Notes">
      <section aria-busy={isRefreshing} className="panel list-panel panel-loading-shell">
        {!visibleItems ? (
          <div className="dashboard-loading panel-loading">
            <div className="status-dot" />
            <p>Loading notes...</p>
          </div>
        ) : null}
        <div className="list-stack">
          {visibleItems?.map((item) => (
            <article className="list-card" key={item.noteId}>
              <div className="stack-row">
                <h2>{item.title}</h2>
                {item.tagSlug ? <span className="pill">{item.tagSlug}</span> : null}
              </div>
              <p className="panel-copy prewrap">{item.content}</p>
              {item.sourceQuote ? <blockquote className="source-quote">{item.sourceQuote}</blockquote> : null}
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
          {visibleItems?.length === 0 ? <p className="panel-copy">No approved notes yet.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
