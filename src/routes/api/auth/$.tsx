import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => proxyAuthRequest(request),
      POST: async ({ request }) => proxyAuthRequest(request)
    }
  }
});

async function proxyAuthRequest(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const targetUrl = new URL(`${getRequiredEnv("CONVEX_SITE_URL")}${requestUrl.pathname}${requestUrl.search}`);
  const proxiedRequest = new Request(targetUrl, request);

  proxiedRequest.headers.set("accept-encoding", "application/json");
  proxiedRequest.headers.set("host", targetUrl.host);

  return fetch(proxiedRequest, {
    method: request.method,
    redirect: "manual"
  });
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
