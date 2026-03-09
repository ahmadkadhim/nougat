import { createFileRoute, redirect } from "@tanstack/react-router";
import { SignInForm } from "../components/sign-in-form";

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined
  }),
  beforeLoad: ({ context }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ to: "/dashboard", replace: true });
    }
  },
  component: SignInPage
});

function SignInPage() {
  const search = Route.useSearch();
  return <SignInForm redirectTo={search.redirect} />;
}
