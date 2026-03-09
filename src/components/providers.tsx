import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import { useState, type ReactNode } from "react";
import { authClient } from "../lib/auth-client";

export function Providers({
  children,
  convexUrl
}: {
  children: ReactNode;
  convexUrl: string;
}) {
  const [client] = useState(() => new ConvexReactClient(convexUrl));

  return (
    <ConvexBetterAuthProvider authClient={authClient} client={client}>
      {children}
    </ConvexBetterAuthProvider>
  );
}
