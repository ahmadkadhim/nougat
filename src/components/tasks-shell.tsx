import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "./app-shell";
import { ProvenanceBlock, RelatedViewpoints } from "./derived-support";

export function TasksShell() {
  const tasks = useQuery(api.derived.listTasks, { limit: 100 });

  if (!tasks) {
    return (
      <main className="dashboard-loading">
        <div className="status-dot" />
        <p>Loading tasks...</p>
      </main>
    );
  }

  return (
    <AppShell subtitle="Approved tasks live here until Linear sync becomes the downstream home." title="Tasks">
      <section className="panel list-panel">
        <div className="list-stack">
          {tasks.map((task) => (
            <article className="list-card" key={task.taskCandidateId}>
              <div className="stack-row">
                <h2>{task.title}</h2>
                <span className="pill">{task.assigneeType}</span>
              </div>
              <p className="panel-copy">{task.details}</p>
              {task.suggestedAction ? <p className="panel-meta">Suggested action: {task.suggestedAction}</p> : null}
              <p className="panel-meta">{task.tagSlug ?? "general"}</p>
              <ProvenanceBlock
                approvedAt={task.approvedAt}
                justification={task.justification}
                sourceAuthor={task.sourceAuthor}
                sourceCaptureCount={task.sourceCaptureCount}
                sourceUrl={task.sourceUrl}
              />
              <RelatedViewpoints items={task.relatedViewpoints} />
            </article>
          ))}
          {tasks.length === 0 ? <p className="panel-copy">No approved tasks yet.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
