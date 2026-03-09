import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { parseScope } from "./lib/xOAuth";

const PROVIDER = "x";
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const internalApi = internal as any;

type TokenResponse = {
  token_type?: string;
  expires_in?: number;
  access_token?: string;
  refresh_token?: string;
  scope?: string;
};

export const createOAuthState = internalMutation({
  args: {
    ownerAuthUserId: v.string(),
    provider: v.string(),
    state: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("xOAuthStates", {
      ownerAuthUserId: args.ownerAuthUserId,
      provider: args.provider,
      state: args.state,
      codeVerifier: args.codeVerifier,
      redirectUri: args.redirectUri,
      status: "pending",
      createdAt: now,
      updatedAt: now
    });

    return { ok: true };
  }
});

export const getOAuthState = internalQuery({
  args: {
    provider: v.string(),
    state: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("xOAuthStates")
      .withIndex("by_provider_state", (q) => q.eq("provider", args.provider).eq("state", args.state))
      .unique();
  }
});

export const markOAuthState = internalMutation({
  args: {
    provider: v.string(),
    state: v.string(),
    status: v.union(v.literal("completed"), v.literal("failed")),
    error: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("xOAuthStates")
      .withIndex("by_provider_state", (q) => q.eq("provider", args.provider).eq("state", args.state))
      .unique();

    if (!existing) {
      throw new Error("OAuth state not found");
    }

    await ctx.db.patch(existing._id, {
      status: args.status,
      error: args.error,
      updatedAt: Date.now()
    });

    return { ok: true };
  }
});

export const upsertCredentials = internalMutation({
  args: {
    ownerAuthUserId: v.string(),
    provider: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    tokenType: v.optional(v.string()),
    scopes: v.array(v.string()),
    userId: v.optional(v.string()),
    username: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("xOAuthCredentials")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("provider", args.provider)
      )
      .unique();

    const now = Date.now();
    const next = {
      ownerAuthUserId: args.ownerAuthUserId,
      provider: args.provider,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      tokenType: args.tokenType,
      scopes: args.scopes,
      userId: args.userId,
      username: args.username,
      updatedAt: now
    };

    if (existing) {
      await ctx.db.patch(existing._id, next);
      return { ok: true };
    }

    await ctx.db.insert("xOAuthCredentials", {
      ...next,
      createdAt: now
    });

    return { ok: true };
  }
});

export const getCredentials = internalQuery({
  args: {
    ownerAuthUserId: v.string(),
    provider: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("xOAuthCredentials")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("provider", args.provider)
      )
      .unique();
  }
});

export const getOAuthStatus = internalQuery({
  args: {
    ownerAuthUserId: v.string()
  },
  handler: async (ctx, args) => {
    const credentials = await ctx.db
      .query("xOAuthCredentials")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerAuthUserId", args.ownerAuthUserId).eq("provider", PROVIDER)
      )
      .unique();

    if (!credentials) {
      return {
        connected: false
      };
    }

    return {
      connected: true,
      userId: credentials.userId ?? null,
      username: credentials.username ?? null,
      scopes: credentials.scopes,
      expiresAt: credentials.expiresAt ?? null,
      updatedAt: credentials.updatedAt
    };
  }
});

export const getBookmarkAccess = internalAction({
  args: {
    ownerAuthUserId: v.string()
  },
  handler: async (ctx, args) => {
    const credentials = await ctx.runQuery(internalApi.xAuth.getCredentials, {
      ownerAuthUserId: args.ownerAuthUserId,
      provider: PROVIDER
    });

    if (!credentials) {
      throw new Error(`No X bookmark credentials configured for auth user ${args.ownerAuthUserId}`);
    }

    if (!shouldRefresh(credentials.expiresAt)) {
      return {
        accessToken: credentials.accessToken,
        userId: credentials.userId
      };
    }

    if (!credentials.refreshToken) {
      throw new Error("Stored X OAuth credentials are expired and do not include a refresh token");
    }

    const refreshed = await refreshAccessToken({
      clientId: getRequiredEnv("X_OAUTH_CLIENT_ID"),
      clientSecret: process.env.X_OAUTH_CLIENT_SECRET,
      refreshToken: credentials.refreshToken
    });

    const accessToken = refreshed.access_token;
    if (!accessToken) {
      throw new Error("X OAuth refresh response did not include an access token");
    }

    const user = await fetchAuthenticatedUser(accessToken);
    await ctx.runMutation(internalApi.xAuth.upsertCredentials, {
      ownerAuthUserId: args.ownerAuthUserId,
      provider: PROVIDER,
      accessToken,
      refreshToken: refreshed.refresh_token ?? credentials.refreshToken,
      expiresAt: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : credentials.expiresAt,
      tokenType: refreshed.token_type ?? credentials.tokenType,
      scopes: refreshed.scope ? parseScope(refreshed.scope) : credentials.scopes,
      userId: user.id,
      username: user.username
    });

    return {
      accessToken,
      userId: user.id
    };
  }
});

export const listCredentialOwners = internalQuery({
  args: {},
  handler: async (ctx) => {
    const credentials = await ctx.db.query("xOAuthCredentials").collect();
    return credentials
      .filter((credential) => credential.ownerAuthUserId)
      .map((credential) => credential.ownerAuthUserId as string);
  }
});

async function refreshAccessToken(input: {
  clientId: string;
  clientSecret?: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("refresh_token", input.refreshToken);
  body.set("grant_type", "refresh_token");
  body.set("client_id", input.clientId);

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded"
  };
  if (input.clientSecret) {
    headers.authorization = `Basic ${encodeBasicAuth(input.clientId, input.clientSecret)}`;
  }

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body
  });

  if (!response.ok) {
    throw new Error(await buildXAuthError("refresh token", response));
  }

  return (await response.json()) as TokenResponse;
}

export async function exchangeCodeForToken(input: {
  clientId: string;
  clientSecret?: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("code", input.code);
  body.set("grant_type", "authorization_code");
  body.set("client_id", input.clientId);
  body.set("redirect_uri", input.redirectUri);
  body.set("code_verifier", input.codeVerifier);

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded"
  };
  if (input.clientSecret) {
    headers.authorization = `Basic ${encodeBasicAuth(input.clientId, input.clientSecret)}`;
  }

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body
  });

  if (!response.ok) {
    throw new Error(await buildXAuthError("authorization code exchange", response));
  }

  return (await response.json()) as TokenResponse;
}

export async function fetchAuthenticatedUser(accessToken: string): Promise<{ id: string; username?: string }> {
  const response = await fetch("https://api.x.com/2/users/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await buildXAuthError("users/me", response));
  }

  const payload = (await response.json()) as {
    data?: {
      id?: string;
      username?: string;
    };
  };

  const id = payload.data?.id;
  if (!id) {
    throw new Error("X users/me response did not include a user ID");
  }

  return {
    id,
    username: payload.data?.username
  };
}

async function buildXAuthError(step: string, response: Response): Promise<string> {
  const detail = await response.text().catch(() => "");
  const suffix = detail ? `: ${detail.slice(0, 400)}` : "";
  return `X OAuth ${step} failed (${response.status})${suffix}`;
}

function shouldRefresh(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  return expiresAt <= Date.now() + REFRESH_BUFFER_MS;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function encodeBasicAuth(clientId: string, clientSecret: string): string {
  return btoa(`${clientId}:${clientSecret}`);
}
