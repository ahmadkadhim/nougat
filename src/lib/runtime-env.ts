type PublicRuntimeEnv = {
  appOrigin: string;
  convexUrl: string;
};

declare global {
  interface Window {
    __NUGAT_ENV__?: Partial<PublicRuntimeEnv>;
  }
}

export function getAppOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return (
    process.env.APP_ORIGIN ??
    process.env.VITE_APP_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
    import.meta.env.VITE_APP_ORIGIN ??
    "http://localhost:3000"
  );
}

export function getConvexUrl(): string {
  const value =
    typeof window !== "undefined"
      ? window.__NUGAT_ENV__?.convexUrl ?? import.meta.env.VITE_CONVEX_URL
      : process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL ?? import.meta.env.VITE_CONVEX_URL;

  if (!value) {
    throw new Error("Missing required environment variable: VITE_CONVEX_URL");
  }

  return value;
}

export function createRuntimeEnvBootScript(): string {
  const publicEnv: PublicRuntimeEnv = {
    appOrigin: getAppOrigin(),
    convexUrl: getConvexUrl()
  };

  return `window.__NUGAT_ENV__=${JSON.stringify(publicEnv).replace(/</g, "\\u003c")};`;
}
