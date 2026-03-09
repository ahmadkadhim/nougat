import { createFileRoute, redirect } from "@tanstack/react-router";
import { KnowledgeShell } from "../components/knowledge-shell";

export const Route = createFileRoute("/knowledge")({
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
  component: KnowledgePage
});

function KnowledgePage() {
  return <KnowledgeShell />;
}
