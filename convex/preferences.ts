import { v } from "convex/values";
import { normalizeThemePreference } from "../src/lib/theme-config.ts";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { buildStoredThemePreference, getDefaultThemePreference } from "./lib/preferences";

const themeNameValidator = v.union(
  v.literal("almond"),
  v.literal("vanilla"),
  v.literal("hazelnut"),
  v.literal("pistachio"),
  v.literal("rose"),
  v.literal("nutella"),
  v.literal("gumdrop")
);

const themeModeValidator = v.union(v.literal("light"), v.literal("dark"), v.literal("system"));
const typographyNameValidator = v.union(v.literal("serif"), v.literal("grotesque"), v.literal("technical"));

export const getUserPreferences = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const storedPreference = await ctx.db
      .query("userPreferences")
      .withIndex("by_owner_auth_user_id", (q) => q.eq("ownerAuthUserId", user._id))
      .unique();

    if (!storedPreference) {
      return getDefaultThemePreference();
    }

    return normalizeThemePreference(storedPreference);
  }
});

export const setThemePreference = mutation({
  args: {
    themeMode: themeModeValidator,
    themeName: themeNameValidator,
    typographyName: typographyNameValidator
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx as any);
    const now = Date.now();
    const existingPreference = await ctx.db
      .query("userPreferences")
      .withIndex("by_owner_auth_user_id", (q) => q.eq("ownerAuthUserId", user._id))
      .unique();
    const nextPreference = buildStoredThemePreference(args, user._id, now, existingPreference ?? null);

    if (existingPreference) {
      await ctx.db.patch(existingPreference._id, {
        themeMode: nextPreference.themeMode,
        themeName: nextPreference.themeName,
        typographyName: nextPreference.typographyName,
        updatedAt: nextPreference.updatedAt
      });
    } else {
      await ctx.db.insert("userPreferences", nextPreference);
    }

    return normalizeThemePreference(nextPreference);
  }
});
