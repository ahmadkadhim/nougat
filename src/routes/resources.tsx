import { createFileRoute, redirect } from "@tanstack/react-router";
import { ResourcesShell } from "../components/resources-shell";

export const Route = createFileRoute("/resources")({
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
  component: ResourcesPage
});

function ResourcesPage() {
  return <ResourcesShell />;
}
