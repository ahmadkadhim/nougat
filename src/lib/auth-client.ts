import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

const appOrigin =
  typeof window !== "undefined"
    ? window.location.origin
    : import.meta.env.VITE_APP_ORIGIN ?? "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL: new URL("/api/auth", appOrigin).toString(),
  plugins: [convexClient()]
});
