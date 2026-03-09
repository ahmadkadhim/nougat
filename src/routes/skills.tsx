import { createFileRoute, redirect } from "@tanstack/react-router";
import { SkillsShell } from "../components/skills-shell";

export const Route = createFileRoute("/skills")({
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
  component: SkillsPage
});

function SkillsPage() {
  return <SkillsShell />;
}
