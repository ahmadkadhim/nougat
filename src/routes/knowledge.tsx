import { createFileRoute, redirect } from "@tanstack/react-router";

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
    throw redirect({
      to: "/notes",
      replace: true
    });
  },
  component: () => null
});
