import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { getAppOrigin } from "./runtime-env";

const appOrigin = getAppOrigin();

export const authClient = createAuthClient({
  baseURL: new URL("/api/auth", appOrigin).toString(),
  plugins: [convexClient()]
});
