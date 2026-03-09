import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { internalAction, internalMutation, query } from "./_generated/server";

type DigestCapture = {
  platform: string;
  confidence?: number;
  titleHint?: string;
  canonicalUrl: string;
};

export const generateDigest: any = internalAction({
  args: {
    period: v.union(v.literal("daily"), v.literal("weekly"))
  },
  handler: async (ctx, args): Promise<{ ok: true; period: "daily" | "weekly"; captures: number }> => {
    const now = Date.now();
    const windowMs = args.period === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const windowStart = now - windowMs;

    const captures: DigestCapture[] = await ctx.runQuery(api.captures.listCapturesByWindow, {
      from: windowStart,
      to: now,
      limit: 5000
    });

    const platformCounts = captures.reduce((acc: Record<string, number>, item: DigestCapture) => {
      acc[item.platform] = (acc[item.platform] ?? 0) + 1;
      return acc;
    }, {});

    const prioritized = captures
      .slice()
      .sort((a: DigestCapture, b: DigestCapture) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 20)
      .map(
        (item: DigestCapture, idx: number) =>
          `${idx + 1}. ${item.titleHint ?? item.canonicalUrl} (${item.platform}, confidence ${item.confidence ?? 0})`
      )
      .join("\n");

    const summary = [
      `${args.period[0].toUpperCase()}${args.period.slice(1)} digest generated ${new Date(now).toISOString()}.`,
      `Captured items: ${captures.length}.`,
      `Platforms: ${Object.entries(platformCounts)
        .map(([platform, count]) => `${platform}=${count}`)
        .join(", ") || "none"}.`
    ].join(" ");

    const markdown = [
      `# ${args.period[0].toUpperCase()}${args.period.slice(1)} Knowledge Digest`,
      "",
      summary,
      "",
      "## Prioritized Review Queue",
      prioritized || "No captures in this window."
    ].join("\n");

    await ctx.runMutation(internal.digests.upsertDigest, {
      period: args.period,
      windowStart,
      windowEnd: now,
      summary,
      markdown,
      title: `${args.period.toUpperCase()} Digest ${new Date(now).toISOString().slice(0, 10)}`
    });

    return {
      ok: true,
      period: args.period,
      captures: captures.length
    };
  }
});

export const upsertDigest = internalMutation({
  args: {
    period: v.union(v.literal("daily"), v.literal("weekly")),
    windowStart: v.number(),
    windowEnd: v.number(),
    title: v.string(),
    summary: v.string(),
    markdown: v.string()
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("digests")
      .withIndex("by_period_window", (q) => q.eq("period", args.period).eq("windowStart", args.windowStart))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        summary: args.summary,
        markdown: args.markdown,
        windowEnd: args.windowEnd
      });
      return { digestId: existing.digestId, updated: true };
    }

    const digestId = `dig_${crypto.randomUUID()}`;
    await ctx.db.insert("digests", {
      digestId,
      period: args.period,
      windowStart: args.windowStart,
      windowEnd: args.windowEnd,
      title: args.title,
      summary: args.summary,
      markdown: args.markdown,
      createdAt: Date.now()
    });

    return { digestId, updated: false };
  }
});

export const listDigests = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 100);
    return await ctx.db.query("digests").withIndex("by_created_at").order("desc").take(limit);
  }
});
