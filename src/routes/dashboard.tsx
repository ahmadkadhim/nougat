import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardShell } from "../components/dashboard-shell";

export const Route = createFileRoute("/dashboard")({
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
  component: DashboardPage
});

function DashboardPage() {
  return <DashboardShell />;
}
