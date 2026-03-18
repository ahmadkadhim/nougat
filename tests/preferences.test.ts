import assert from "node:assert/strict";
import test from "node:test";
import { buildStoredThemePreference, getDefaultThemePreference } from "../convex/lib/preferences.ts";

test("buildStoredThemePreference creates a first preference row with defaults normalized", () => {
  const now = 1_710_000_000_000;
  const preference = buildStoredThemePreference({ themeMode: "dark", themeName: "rose", typographyName: "technical" }, "user_123", now, null);

  assert.deepEqual(preference, {
    createdAt: now,
    ownerAuthUserId: "user_123",
    themeMode: "dark",
    themeName: "rose",
    typographyName: "technical",
    updatedAt: now
  });
});

test("buildStoredThemePreference keeps createdAt when updating an existing row", () => {
  const existing = buildStoredThemePreference({ themeMode: "system", themeName: "vanilla", typographyName: "serif" }, "user_123", 100, null);
  const updated = buildStoredThemePreference({ themeMode: "light", themeName: "almond", typographyName: "grotesque" }, "user_123", 200, existing);

  assert.deepEqual(updated, {
    createdAt: 100,
    ownerAuthUserId: "user_123",
    themeMode: "light",
    themeName: "almond",
    typographyName: "grotesque",
    updatedAt: 200
  });
});

test("getDefaultThemePreference exposes the synced default", () => {
  assert.deepEqual(getDefaultThemePreference(), {
    themeMode: "system",
    themeName: "vanilla",
    typographyName: "serif"
  });
});

test("buildStoredThemePreference upgrades legacy rows that are missing typography", () => {
  const updated = buildStoredThemePreference(
    {
      themeMode: "dark",
      themeName: "pistachio"
    },
    "user_legacy",
    300,
    { createdAt: 100 }
  );

  assert.deepEqual(updated, {
    createdAt: 100,
    ownerAuthUserId: "user_legacy",
    themeMode: "dark",
    themeName: "pistachio",
    typographyName: "serif",
    updatedAt: 300
  });
});
