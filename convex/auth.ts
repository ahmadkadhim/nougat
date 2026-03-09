import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { query } from "./_generated/server";
import { components } from "./_generated/api";
import authConfig from "./auth.config";

export const authComponent = createClient(components.betterAuth as any);

export const createAuth = (ctx: any) =>
  betterAuth({
    appName: "Nougat",
    basePath: "/api/auth",
    baseURL: getBaseUrl(),
    trustedOrigins: getTrustedOrigins(),
    secret: getRequiredEnv("BETTER_AUTH_SECRET"),
    database: authComponent.adapter(ctx),
    advanced: {
      useSecureCookies: shouldUseSecureCookies()
    },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false
    },
    plugins: [
      convex({
        authConfig
      })
    ]
  });

export const { getAuthUser } = authComponent.clientApi();

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx as any);
    if (!user) return null;

    return {
      id: user._id,
      email: user.email,
      name: user.name ?? null,
      image: user.image ?? null
    };
  }
});

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getBaseUrl(): string {
  return process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_ORIGIN ?? getRequiredEnv("CONVEX_SITE_URL");
}

function shouldUseSecureCookies(): boolean {
  const baseUrl = getBaseUrl();
  return !baseUrl.startsWith("http://localhost:") && !baseUrl.startsWith("http://127.0.0.1:");
}

function getTrustedOrigins(): string[] {
  const origins = new Set<string>();
  if (process.env.APP_ORIGIN) {
    origins.add(process.env.APP_ORIGIN);
  }
  if (process.env.NEXT_PUBLIC_APP_ORIGIN) {
    origins.add(process.env.NEXT_PUBLIC_APP_ORIGIN);
  }
  origins.add("http://localhost:3000");
  return [...origins];
}
