import { v } from "convex/values";
import { mutation } from "./_generated/server";

const DEFAULT_PER_MINUTE = 120;
const configuredLimit = Number((globalThis as any).process?.env?.RATE_LIMIT_PER_MINUTE ?? DEFAULT_PER_MINUTE);

export const consumeDeviceQuota = mutation({
  args: {
    deviceId: v.string(),
    units: v.number()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const minuteBucket = Math.floor(now / 60_000);
    const windowKey = `${args.deviceId}:${minuteBucket}`;
    const limit = Number.isFinite(configuredLimit) ? configuredLimit : DEFAULT_PER_MINUTE;

    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_device_window", (q) => q.eq("deviceId", args.deviceId).eq("windowKey", windowKey))
      .unique();

    if (!existing) {
      if (args.units > limit) {
        return { allowed: false, limit, current: 0, next: args.units };
      }

      await ctx.db.insert("rateLimits", {
        deviceId: args.deviceId,
        windowKey,
        count: args.units,
        updatedAt: now
      });

      return { allowed: true, limit, current: 0, next: args.units };
    }

    const nextCount = existing.count + args.units;
    if (nextCount > limit) {
      return { allowed: false, limit, current: existing.count, next: nextCount };
    }

    await ctx.db.patch(existing._id, { count: nextCount, updatedAt: now });
    return { allowed: true, limit, current: existing.count, next: nextCount };
  }
});
