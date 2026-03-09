import { createFileRoute, redirect } from "@tanstack/react-router";
import { ReviewQueueShell } from "../components/review-queue-shell";

export const Route = createFileRoute("/review")({
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
  component: ReviewPage
});

function ReviewPage() {
  return <ReviewQueueShell />;
}
