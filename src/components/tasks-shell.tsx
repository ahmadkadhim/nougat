import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRetainedValue } from "../lib/use-retained-value";
import { AppShell } from "./app-shell";
import { ProvenanceBlock } from "./derived-support";

export function TasksShell() {
  const tasks = useQuery(api.derived.listTasks, { limit: 100 });
  const visibleTasks = useRetainedValue(tasks);
  const isRefreshing = tasks === undefined && visibleTasks !== undefined;

  return (
    <AppShell subtitle="Approved tasks live here until Linear sync becomes the downstream home." title="Tasks">
      <section aria-busy={isRefreshing} className="panel list-panel panel-loading-shell">
        {!visibleTasks ? (
          <div className="dashboard-loading panel-loading">
            <div className="status-dot" />
            <p>Loading tasks...</p>
          </div>
        ) : null}
        <div className="list-stack">
          {visibleTasks?.map((task) => (
            <article className="list-card" key={task.taskCandidateId}>
              <div className="stack-row">
                <h2>{task.title}</h2>
                <span className="pill">{task.assigneeType}</span>
              </div>
              <p className="panel-copy">{task.details}</p>
              {task.suggestedAction ? <p className="panel-meta">Suggested action: {task.suggestedAction}</p> : null}
              {task.triggerContext ? <p className="panel-meta">Trigger: {task.triggerContext}</p> : null}
              <p className="panel-meta">{task.tagSlug ?? "general"}</p>
              <ProvenanceBlock
                approvedAt={task.approvedAt}
                sourceAuthor={task.sourceAuthor}
                sourceCaptureCount={task.sourceCaptureCount}
                sourceUrl={task.sourceUrl}
                why={task.why}
              />
            </article>
          ))}
          {isRefreshing ? <p className="panel-meta subtle-status-row">Refreshing…</p> : null}
          {visibleTasks?.length === 0 ? <p className="panel-copy">No approved tasks yet.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}
