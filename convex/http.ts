import { httpRouter } from "convex/server";
import { api, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { randomToken, sha256Hex } from "./lib/hash";
import {
  badRequest,
  forbidden,
  getBearerToken,
  getOperatorKey,
  html,
  json,
  parseJson,
  redirect,
  tooManyRequests,
  unauthorized
} from "./lib/http";
import { buildXAuthorizeUrl, createOAuthState, createPkcePair, defaultXScopes, parseScope } from "./lib/xOAuth";
import { exchangeCodeForToken, fetchAuthenticatedUser } from "./xAuth";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();
const internalApi = internal as any;

authComponent.registerRoutes(http, createAuth);

http.route({
  path: "/v1/devices/register",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await parseJson(request);
    if (!isRecord(body)) return badRequest("Invalid JSON payload");

    const name = typeof body.name === "string" ? body.name.trim() : "Unnamed device";
    const platform = typeof body.platform === "string" ? body.platform.trim() : "unknown";
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((item): item is string => typeof item === "string") : ["capture:write"];

    const deviceId = `dev_${crypto.randomUUID()}`;
    const token = randomToken("kbx");
    const tokenHash = await sha256Hex(token);

    await ctx.runMutation(internal.devices.createDevice, {
      deviceId,
      name,
      platform,
      tokenHash,
      scopes
    });

    return json({
      device_id: deviceId,
      token,
      scopes
    });
  })
});

http.route({
  path: "/v1/devices/rotate-token",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = await authenticateDevice(ctx, request);
    if (!auth.device) return unauthorized();

    const token = randomToken("kbx");
    const tokenHash = await sha256Hex(token);

    await ctx.runMutation(internal.devices.rotateDeviceToken, {
      deviceId: auth.device.deviceId,
      newTokenHash: tokenHash
    });

    return json({
      device_id: auth.device.deviceId,
      token
    });
  })
});

http.route({
  path: "/v1/captures",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = await authenticateDevice(ctx, request);
    if (!auth.device) return unauthorized();

    const body = await parseJson(request);
    if (!isCaptureRequest(body)) return badRequest("Invalid capture payload");

    const quota = await ctx.runMutation(api.rateLimit.consumeDeviceQuota, {
      deviceId: auth.device.deviceId,
      units: 1
    });

    if (!quota.allowed) {
      return tooManyRequests(`Rate limit exceeded (${quota.limit}/minute)`);
    }

    const result = await ctx.runMutation(api.captures.ingestCapture, {
      deviceId: auth.device.deviceId,
      request: body,
      rawPayload: body
    });

    return json(
      {
        accepted: !result.deduped,
        deduped: result.deduped,
        capture_id: result.capture_id,
        extraction_status: result.extraction_status,
        canonical_url: result.canonical_url
      },
      { status: 202 }
    );
  })
});

http.route({
  path: "/v1/captures/bulk",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = await authenticateDevice(ctx, request);
    if (!auth.device) return unauthorized();

    const body = await parseJson(request);
    if (!isRecord(body) || !Array.isArray(body.requests)) {
      return badRequest("Payload must include requests[]");
    }

    const requests = body.requests.filter(isCaptureRequest);
    if (requests.length === 0) {
      return badRequest("No valid capture requests in payload");
    }

    const quota = await ctx.runMutation(api.rateLimit.consumeDeviceQuota, {
      deviceId: auth.device.deviceId,
      units: requests.length
    });
    if (!quota.allowed) {
      return tooManyRequests(`Rate limit exceeded (${quota.limit}/minute)`);
    }

    const result = await ctx.runMutation(api.captures.ingestBulkCaptures, {
      deviceId: auth.device.deviceId,
      requests
    });

    return json(result, { status: 202 });
  })
});

http.route({
  path: "/v1/captures/:captureId",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const auth = await authenticateDevice(ctx, request);
    if (!auth.device) return unauthorized();

    const captureId = pathId(request.url, "captures");
    if (!captureId) return badRequest("Missing capture ID");

    const result = await ctx.runQuery(api.captures.getCaptureByCaptureId, { captureId });
    if (!result) return json({ error: "Not found" }, { status: 404 });

    return json({
      capture_id: result.capture.captureId,
      extraction_status: result.capture.extractionStatus,
      updated_at: result.capture.updatedAt,
      capture: result.capture,
      job: result.job,
      document: result.document
    });
  })
});

http.route({
  path: "/v1/capture-status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const auth = await authenticateDevice(ctx, request);
    if (!auth.device) return unauthorized();

    const url = new URL(request.url);
    const captureId = url.searchParams.get("capture_id");
    if (!captureId) return badRequest("Missing capture_id query parameter");

    const result = await ctx.runQuery(api.captures.getCaptureByCaptureId, { captureId });
    if (!result) return json({ error: "Not found" }, { status: 404 });

    return json({
      capture_id: result.capture.captureId,
      extraction_status: result.capture.extractionStatus,
      updated_at: result.capture.updatedAt,
      capture: result.capture,
      job: result.job,
      document: result.document
    });
  })
});

http.route({
  path: "/v1/captures/:captureId/reprocess",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = await authenticateDevice(ctx, request);
    if (!auth.device) return unauthorized();

    const captureId = pathId(request.url, "captures");
    if (!captureId) return badRequest("Missing capture ID");

    const result = await ctx.runMutation(api.captures.requestReprocess, { captureId });
    return json(result, { status: 202 });
  })
});

http.route({
  path: "/v1/capture-reprocess",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = await authenticateDevice(ctx, request);
    if (!auth.device) return unauthorized();

    const body = await parseJson(request);
    if (!isRecord(body) || typeof body.capture_id !== "string") {
      return badRequest("Missing capture_id");
    }

    const result = await ctx.runMutation(api.captures.requestReprocess, { captureId: body.capture_id });
    return json(result, { status: 202 });
  })
});

http.route({
  path: "/v1/operator/captures/new",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const captures = await ctx.runQuery(api.captures.listNewCaptures, { limit });
    return json({ captures });
  })
});

http.route({
  path: "/v1/operator/captures/failed",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const captures = await ctx.runQuery(api.captures.listFailedCaptures, { limit });
    return json({ captures });
  })
});

http.route({
  path: "/v1/operator/captures/dedupe-conflicts",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const duplicates = await ctx.runQuery(api.captures.listDedupeConflicts, { limit });
    return json({ duplicates });
  })
});

http.route({
  path: "/v1/operator/captures/:captureId/reprocess",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();

    const captureId = pathId(request.url, "captures");
    if (!captureId) return badRequest("Missing capture ID");
    const result = await ctx.runMutation(api.captures.requestReprocess, { captureId });

    return json(result, { status: 202 });
  })
});

http.route({
  path: "/v1/operator/reprocess-capture",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();

    const body = await parseJson(request);
    if (!isRecord(body) || typeof body.capture_id !== "string") {
      return badRequest("Missing capture_id");
    }
    const result = await ctx.runMutation(api.captures.requestReprocess, { captureId: body.capture_id });
    return json(result, { status: 202 });
  })
});

http.route({
  path: "/v1/operator/markdown/pending",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const documents = await ctx.runQuery(api.captures.listPendingMarkdown, { limit });
    return json({ documents });
  })
});

http.route({
  path: "/v1/operator/markdown/mark-exported",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();

    const body = await parseJson(request);
    if (!isRecord(body) || typeof body.document_id !== "string") {
      return badRequest("Missing document_id");
    }

    const result = await ctx.runMutation(api.captures.markMarkdownExported, {
      documentId: body.document_id
    });
    return json(result, { status: 202 });
  })
});

http.route({
  path: "/v1/operator/markdown/:documentId/exported",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();

    const documentId = pathId(request.url, "markdown");
    if (!documentId) return badRequest("Missing document ID");

    const result = await ctx.runMutation(api.captures.markMarkdownExported, {
      documentId
    });

    return json(result, { status: 202 });
  })
});

http.route({
  path: "/v1/operator/knowledge-markdown/pending",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const ownerAuthUserId = url.searchParams.get("owner_user_id");
    if (!ownerAuthUserId) return badRequest("Missing owner_user_id");

    const documents = await ctx.runQuery(api.derived.listPendingKnowledgeMarkdownForOwner, {
      ownerAuthUserId,
      limit
    });
    return json({
      documents: documents.map((item) => ({
        documentId: item.knowledgeItemId,
        path: item.markdownPath,
        markdown: item.markdown
      }))
    });
  })
});

http.route({
  path: "/v1/operator/knowledge-markdown/:knowledgeItemId/exported",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();

    const knowledgeItemId = pathId(request.url, "knowledge-markdown");
    if (!knowledgeItemId) return badRequest("Missing knowledge item ID");

    const result = await ctx.runMutation(api.derived.markKnowledgeMarkdownExported, {
      knowledgeItemId
    });

    return json(result, { status: 202 });
  })
});

http.route({
  path: "/v1/operator/resource-markdown/pending",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "100");
    const ownerAuthUserId = url.searchParams.get("owner_user_id");
    if (!ownerAuthUserId) return badRequest("Missing owner_user_id");

    const documents = await ctx.runQuery(api.derived.listPendingResourceMarkdownForOwner, {
      ownerAuthUserId,
      limit
    });
    return json({
      documents: documents.map((item) => ({
        documentId: item.resourceId,
        path: item.markdownPath,
        markdown: item.markdown
      }))
    });
  })
});

http.route({
  path: "/v1/operator/resource-markdown/:resourceId/exported",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();

    const resourceId = pathId(request.url, "resource-markdown");
    if (!resourceId) return badRequest("Missing resource ID");

    const result = await ctx.runMutation(api.derived.markResourceMarkdownExported, {
      resourceId
    });

    return json(result, { status: 202 });
  })
});

http.route({
  path: "/v1/operator/digests",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const digests = await ctx.runQuery(api.digests.listDigests, { limit });
    return json({ digests });
  })
});

http.route({
  path: "/v1/operator/x-bookmarks/sync",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();

    const result = await ctx.runAction(internalApi.xBookmarks.runScheduledSync, {});
    return json(result, { status: 202 });
  })
});

http.route({
  path: "/v1/operator/x-bookmarks/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();

    const ownerAuthUserId = new URL(request.url).searchParams.get("owner_user_id");
    if (!ownerAuthUserId) return badRequest("Missing owner_user_id");

    const state = await ctx.runQuery(internalApi.xBookmarks.getSyncState, {
      ownerAuthUserId,
      sourceKey: "default"
    });

    return json({ state });
  })
});

http.route({
  path: "/v1/operator/x/oauth/start",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();

    const clientId = process.env.X_OAUTH_CLIENT_ID;
    if (!clientId) {
      return badRequest("Missing X_OAUTH_CLIENT_ID");
    }

    const ownerAuthUserId = new URL(request.url).searchParams.get("owner_user_id");
    if (!ownerAuthUserId) {
      return badRequest("Missing owner_user_id");
    }

    const redirectUri = getXOAuthRedirectUri(request);
    const { verifier, challenge } = await createPkcePair();
    const state = createOAuthState();

    await ctx.runMutation(internalApi.xAuth.createOAuthState, {
      ownerAuthUserId,
      provider: "x",
      state,
      codeVerifier: verifier,
      redirectUri
    });

    const authorizeUrl = buildXAuthorizeUrl({
      clientId,
      redirectUri,
      state,
      codeChallenge: challenge,
      scopes: defaultXScopes()
    });

    return redirect(authorizeUrl);
  })
});

http.route({
  path: "/v1/operator/x/oauth/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!isOperatorAuthorized(request)) return forbidden();
    const ownerAuthUserId = new URL(request.url).searchParams.get("owner_user_id");
    if (!ownerAuthUserId) return badRequest("Missing owner_user_id");

    const status = await ctx.runQuery(internalApi.xAuth.getOAuthStatus, {
      ownerAuthUserId
    });
    return json(status);
  })
});

http.route({
  path: "/v1/operator/x/oauth/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (!state) {
      return badRequest("Missing OAuth state");
    }

    const oauthState = await ctx.runQuery(internalApi.xAuth.getOAuthState, {
      provider: "x",
      state
    });
    if (!oauthState || oauthState.status !== "pending") {
      return badRequest("OAuth state is invalid or already used");
    }

    if (error) {
      await ctx.runMutation(internalApi.xAuth.markOAuthState, {
        provider: "x",
        state,
        status: "failed",
        error: errorDescription ?? error
      });

      return html(renderOAuthResultPage(`X authorization failed: ${errorDescription ?? error}`), {
        status: 400
      });
    }

    if (!code) {
      return badRequest("Missing OAuth code");
    }

    try {
      const tokens = await exchangeCodeForToken({
        clientId: getRequiredEnv("X_OAUTH_CLIENT_ID"),
        clientSecret: process.env.X_OAUTH_CLIENT_SECRET,
        code,
        codeVerifier: oauthState.codeVerifier,
        redirectUri: oauthState.redirectUri
      });

      const accessToken = tokens.access_token;
      if (!accessToken) {
        throw new Error("X OAuth exchange did not return an access token");
      }

      const user = await fetchAuthenticatedUser(accessToken);
      await ctx.runMutation(internalApi.xAuth.upsertCredentials, {
        ownerAuthUserId: oauthState.ownerAuthUserId,
        provider: "x",
        accessToken,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
        tokenType: tokens.token_type,
        scopes: parseScope(tokens.scope),
        userId: user.id,
        username: user.username
      });

      await ctx.runMutation(internalApi.xAuth.markOAuthState, {
        provider: "x",
        state,
        status: "completed"
      });

      return html(renderOAuthResultPage("X is connected. You can return to Nougat and run the bookmark sync."), {
        status: 200
      });
    } catch (oauthError) {
      const message = oauthError instanceof Error ? oauthError.message : "Unknown X OAuth callback failure";
      await ctx.runMutation(internalApi.xAuth.markOAuthState, {
        provider: "x",
        state,
        status: "failed",
        error: message
      });

      return html(renderOAuthResultPage(message), {
        status: 500
      });
    }
  })
});

export default http;

async function authenticateDevice(ctx: any, request: Request) {
  const token = getBearerToken(request);
  if (!token) return { device: null };

  const tokenHash = await sha256Hex(token);
  const device = await ctx.runQuery(api.devices.getDeviceByTokenHash, { tokenHash });

  if (!device || device.status !== "active") {
    return { device: null };
  }

  await ctx.runMutation(api.devices.touchDeviceSeen, { deviceId: device.deviceId });
  return { device };
}

function isOperatorAuthorized(request: Request): boolean {
  const required = process.env.OPERATOR_API_KEY;
  if (!required) return true;

  const supplied = getOperatorKey(request);
  return supplied === required;
}

function isCaptureRequest(value: unknown): value is {
  source_url: string;
  captured_at: number;
  capture_method: "single_tab" | "selected_tabs" | "window_tabs" | "all_tabs" | "share_sheet" | "manual" | "x_bookmark_sync";
  source_app: string;
  title_hint?: string;
  selected_text?: string;
  tab_context?: string;
  platform_hint?: string;
  source_metadata?: Record<string, unknown>;
  idempotency_key?: string;
} {
  if (!isRecord(value)) return false;

  const allowedCaptureMethods = new Set([
    "single_tab",
    "selected_tabs",
    "window_tabs",
    "all_tabs",
    "share_sheet",
    "manual",
    "x_bookmark_sync"
  ]);

  return (
    typeof value.source_url === "string" &&
    typeof value.captured_at === "number" &&
    allowedCaptureMethods.has(String(value.capture_method)) &&
    typeof value.source_app === "string"
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pathId(rawUrl: string, segment: string): string | null {
  const pathname = new URL(rawUrl).pathname;
  const parts = pathname.split("/").filter(Boolean);

  const index = parts.findIndex((part) => part === segment);
  if (index === -1) return null;

  const id = parts[index + 1];
  if (!id || id.includes(":")) return null;
  return id;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getXOAuthRedirectUri(request: Request): string {
  return process.env.X_OAUTH_REDIRECT_URI ?? new URL("/v1/operator/x/oauth/callback", request.url).toString();
}

function renderOAuthResultPage(message: string): string {
  const safeMessage = message.replace(/[&<>"]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    return "&quot;";
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>X OAuth</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; max-width: 720px; margin: 0 auto; color: #111; }
      .card { border: 1px solid #ddd; border-radius: 12px; padding: 24px; }
      h1 { margin-top: 0; }
      p { line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>X OAuth</h1>
      <p>${safeMessage}</p>
    </div>
  </body>
</html>`;
}
