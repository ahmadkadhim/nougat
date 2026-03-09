import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

export const getDeviceByTokenHash = query({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("devices")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
  }
});

export const getDeviceById = query({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("devices")
      .withIndex("by_device_id", (q) => q.eq("deviceId", args.deviceId))
      .unique();
  }
});

export const createDevice = internalMutation({
  args: {
    deviceId: v.string(),
    name: v.string(),
    platform: v.string(),
    tokenHash: v.string(),
    scopes: v.array(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("devices", {
      deviceId: args.deviceId,
      name: args.name,
      platform: args.platform,
      tokenHash: args.tokenHash,
      tokenVersion: 1,
      scopes: args.scopes,
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now
    });

    return { deviceId: args.deviceId, tokenVersion: 1 };
  }
});

export const rotateDeviceToken = internalMutation({
  args: {
    deviceId: v.string(),
    newTokenHash: v.string()
  },
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_device_id", (q) => q.eq("deviceId", args.deviceId))
      .unique();

    if (!device) {
      throw new Error("Device not found");
    }

    const now = Date.now();
    await ctx.db.patch(device._id, {
      tokenHash: args.newTokenHash,
      tokenVersion: device.tokenVersion + 1,
      updatedAt: now,
      rotatedAt: now,
      lastSeenAt: now
    });

    return { deviceId: args.deviceId, tokenVersion: device.tokenVersion + 1 };
  }
});

export const touchDeviceSeen = mutation({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_device_id", (q) => q.eq("deviceId", args.deviceId))
      .unique();

    if (!device) return null;
    const now = Date.now();
    await ctx.db.patch(device._id, { lastSeenAt: now, updatedAt: now });
    return true;
  }
});
