import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { Providers } from "./components/providers";
import { createLoggedOutAuthSnapshot } from "./lib/auth-session";
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
    Wrap: ({ children }) => <Providers convexUrl={getRequiredClientEnv("VITE_CONVEX_URL")}>{children}</Providers>
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

function getRequiredClientEnv(name: "VITE_CONVEX_URL"): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
