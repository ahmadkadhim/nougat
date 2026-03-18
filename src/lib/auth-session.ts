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

const CLIENT_AUTH_CACHE_TTL_MS = 60_000;

let clientAuthSnapshotCache:
  | {
      fetchedAt: number;
      snapshot: AuthSnapshot;
    }
  | null = null;
let clientAuthSnapshotPromise: Promise<AuthSnapshot> | null = null;

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

  if (typeof window !== "undefined") {
    const cachedSnapshot = getFreshClientAuthSnapshot();
    if (cachedSnapshot) {
      return cachedSnapshot;
    }

    if (!clientAuthSnapshotPromise) {
      clientAuthSnapshotPromise = fetchSessionResponse()
        .then((response) => {
          const snapshot = toAuthSnapshot(response);
          setClientAuthSnapshot(snapshot);
          return snapshot;
        })
        .finally(() => {
          clientAuthSnapshotPromise = null;
        });
    }

    return clientAuthSnapshotPromise;
  }

  const response = await fetchSessionResponse();
  return toAuthSnapshot(response);
}

export function invalidateAuthSnapshotCache() {
  clientAuthSnapshotCache = null;
  clientAuthSnapshotPromise = null;
}

export function setClientAuthSnapshot(snapshot: AuthSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  clientAuthSnapshotCache = {
    fetchedAt: Date.now(),
    snapshot
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

function getFreshClientAuthSnapshot(): AuthSnapshot | null {
  if (!clientAuthSnapshotCache) {
    return null;
  }

  if (Date.now() - clientAuthSnapshotCache.fetchedAt > CLIENT_AUTH_CACHE_TTL_MS) {
    clientAuthSnapshotCache = null;
    return null;
  }

  return clientAuthSnapshotCache.snapshot;
}

function toAuthSnapshot(response: AuthSessionPayload | null): AuthSnapshot {
  if (!response?.session || !response.user) {
    return createLoggedOutAuthSnapshot();
  }

  return {
    isAuthenticated: true,
    session: response.session,
    user: response.user
  };
}
