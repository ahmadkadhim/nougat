import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { randomToken, sha256Hex } from "./lib/hash";

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
    ownerAuthUserId: v.optional(v.string()),
    name: v.string(),
    platform: v.string(),
    tokenHash: v.string(),
    scopes: v.array(v.string())
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("devices", {
      deviceId: args.deviceId,
      ownerAuthUserId: args.ownerAuthUserId,
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

export const provisionBrowserExtension = mutation({
  args: {
    currentDeviceId: v.optional(v.string()),
    deviceName: v.optional(v.string()),
    platform: v.optional(v.string()),
    sourceApp: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const ownerAuthUserId = user._id;
    const now = Date.now();
    const token = randomToken("kbx");
    const tokenHash = await sha256Hex(token);
    const deviceName = args.deviceName?.trim() || "Browser Extension";
    const platform = args.platform?.trim() || "browser";
    const sourceApp = args.sourceApp?.trim() || "chrome_extension";
    let claimedCaptures = 0;

    if (args.currentDeviceId?.trim()) {
      const existingDevice = await ctx.db
        .query("devices")
        .withIndex("by_device_id", (q) => q.eq("deviceId", args.currentDeviceId!.trim()))
        .unique();

      if (existingDevice) {
        if (existingDevice.ownerAuthUserId && existingDevice.ownerAuthUserId !== ownerAuthUserId) {
          throw new Error("That browser extension device already belongs to another user.");
        }

        await ctx.db.patch(existingDevice._id, {
          ownerAuthUserId,
          name: existingDevice.name || deviceName,
          platform: existingDevice.platform || platform,
          tokenHash,
          tokenVersion: existingDevice.tokenVersion + 1,
          updatedAt: now,
          rotatedAt: now,
          lastSeenAt: now,
          status: "active"
        });

        claimedCaptures = await claimCapturesForDevice(ctx, existingDevice.deviceId, ownerAuthUserId, now);

        return {
          apiBaseUrl: getRequiredEnv("CONVEX_SITE_URL"),
          claimedCaptures,
          deviceId: existingDevice.deviceId,
          sourceApp,
          token
        };
      }
    }

    const deviceId = `dev_${crypto.randomUUID()}`;
    await ctx.db.insert("devices", {
      deviceId,
      ownerAuthUserId,
      name: deviceName,
      platform,
      tokenHash,
      tokenVersion: 1,
      scopes: ["capture:write"],
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now
    });

    return {
      apiBaseUrl: getRequiredEnv("CONVEX_SITE_URL"),
      claimedCaptures,
      deviceId,
      sourceApp,
      token
    };
  }
});

export const assignOwnershipToDeviceIds = internalMutation({
  args: {
    deviceIds: v.array(v.string()),
    ownerAuthUserId: v.string()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let claimedCaptures = 0;
    let claimedDevices = 0;

    for (const deviceId of [...new Set(args.deviceIds.map((value) => value.trim()).filter(Boolean))]) {
      const device = await ctx.db
        .query("devices")
        .withIndex("by_device_id", (q) => q.eq("deviceId", deviceId))
        .unique();

      if (device) {
        if (device.ownerAuthUserId && device.ownerAuthUserId !== args.ownerAuthUserId) {
          throw new Error(`Device ${deviceId} already belongs to another user.`);
        }

        if (device.ownerAuthUserId !== args.ownerAuthUserId) {
          await ctx.db.patch(device._id, {
            ownerAuthUserId: args.ownerAuthUserId,
            updatedAt: now
          });
          claimedDevices += 1;
        }
      }

      claimedCaptures += await claimCapturesForDevice(ctx, deviceId, args.ownerAuthUserId, now);
    }

    return {
      claimedCaptures,
      claimedDevices,
      ok: true
    };
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

async function claimCapturesForDevice(ctx: any, deviceId: string, ownerAuthUserId: string, now: number) {
  const captures = await ctx.db
    .query("captures")
    .withIndex("by_device_created_at", (q: any) => q.eq("deviceId", deviceId))
    .collect();

  let claimedCaptures = 0;

  for (const capture of captures) {
    if (capture.ownerAuthUserId && capture.ownerAuthUserId !== ownerAuthUserId) {
      throw new Error(`Capture ${capture.captureId} already belongs to another user.`);
    }

    if (capture.ownerAuthUserId !== ownerAuthUserId) {
      await ctx.db.patch(capture._id, {
        ownerAuthUserId,
        updatedAt: now
      });
      claimedCaptures += 1;
    }
  }

  return claimedCaptures;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
