import { createFileRoute, redirect } from "@tanstack/react-router";
import { NotesShell } from "../components/notes-shell";

export const Route = createFileRoute("/notes")({
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
  component: NotesPage
});

function NotesPage() {
  return <NotesShell />;
}
