import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

const handler = convexBetterAuthNextJs({
  convexUrl: getRequiredEnv("CONVEX_URL"),
  convexSiteUrl: getRequiredEnv("CONVEX_SITE_URL")
}).handler;

export const GET = handler.GET;
export const POST = handler.POST;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
