import { createFileRoute, redirect } from "@tanstack/react-router";
import { TasksShell } from "../components/tasks-shell";

export const Route = createFileRoute("/tasks")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/sign-in",
        search: {
          redirect: location.href
        },
        replace: true
      });
    }
  },
  component: TasksPage
});

function TasksPage() {
  return <TasksShell />;
}
