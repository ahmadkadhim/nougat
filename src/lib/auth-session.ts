import { createIsomorphicFn } from "@tanstack/react-start";

export type AuthSessionPayload = {
  session: {
    id: string;
    expiresAt: string;
    token: string;
    userId: string;
  };
  user: {
    id: string;
    email: string;
    name?: string | null;
    emailVerified: boolean;
  };
};

export type AuthSnapshot = {
  isAuthenticated: boolean;
  session: AuthSessionPayload["session"] | null;
  user: AuthSessionPayload["user"] | null;
};

export function createLoggedOutAuthSnapshot(): AuthSnapshot {
  return {
    isAuthenticated: false,
    session: null,
    user: null
  };
}

export async function getAuthSnapshot(pathname?: string): Promise<AuthSnapshot> {
  if (pathname?.startsWith("/api/auth")) {
    return createLoggedOutAuthSnapshot();
  }

  const response = await fetchSessionResponse();
  if (!response?.session || !response.user) {
    return createLoggedOutAuthSnapshot();
  }

  return {
    isAuthenticated: true,
    session: response.session,
    user: response.user
  };
}

const fetchSessionResponse = createIsomorphicFn()
  .server(async (): Promise<AuthSessionPayload | null> => {
    try {
      const { getRequestHeaders } = await import("@tanstack/react-start/server");
      const headers = new Headers(getRequestHeaders());
      const targetUrl = new URL("/api/auth/get-session", getRequiredEnv("CONVEX_SITE_URL"));

      headers.delete("content-length");
      headers.delete("transfer-encoding");
      headers.set("accept-encoding", "application/json");
      headers.set("host", targetUrl.host);

      const response = await fetch(new Request(targetUrl, { method: "GET", headers }), {
        redirect: "manual"
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as AuthSessionPayload | null;
      return payload?.session && payload.user ? payload : null;
    } catch {
      return null;
    }
  })
  .client(async (): Promise<AuthSessionPayload | null> => {
    try {
      const response = await fetch("/api/auth/get-session", {
        credentials: "include"
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as AuthSessionPayload | null;
      return payload?.session && payload.user ? payload : null;
    } catch {
      return null;
    }
  });

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
