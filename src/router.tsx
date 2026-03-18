import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { Providers } from "./components/providers";
import { createLoggedOutAuthSnapshot } from "./lib/auth-session";
import { getConvexUrl } from "./lib/runtime-env";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    context: {
      auth: createLoggedOutAuthSnapshot()
    },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultViewTransition: true,
    Wrap: ({ children }) => <Providers convexUrl={getConvexUrl()}>{children}</Providers>
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
