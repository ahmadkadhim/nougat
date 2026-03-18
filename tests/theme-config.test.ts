import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_THEME_PREFERENCE,
  getThemePreview,
  normalizeThemePreference,
  readStoredThemePreference,
  resolveThemeMode
} from "../src/lib/theme-config.ts";

test("default theme preference is vanilla system", () => {
  assert.deepEqual(DEFAULT_THEME_PREFERENCE, {
    themeMode: "system",
    themeName: "vanilla",
    typographyName: "serif"
  });
});

test("system mode resolves for light and dark system preferences", () => {
  assert.equal(resolveThemeMode("system", false), "light");
  assert.equal(resolveThemeMode("system", true), "dark");
  assert.equal(resolveThemeMode("light", true), "light");
  assert.equal(resolveThemeMode("dark", false), "dark");
});

test("stored theme preference round-trips through JSON", () => {
  const serialized = JSON.stringify({
    themeMode: "dark",
    themeName: "pistachio",
    typographyName: "technical"
  });

  assert.deepEqual(readStoredThemePreference(serialized), {
    themeMode: "dark",
    themeName: "pistachio",
    typographyName: "technical"
  });
});

test("invalid theme payloads fall back to defaults", () => {
  assert.deepEqual(
    normalizeThemePreference({ themeMode: "night", themeName: "banana", typographyName: "comic" }),
    DEFAULT_THEME_PREFERENCE
  );
  assert.deepEqual(readStoredThemePreference("{nope"), DEFAULT_THEME_PREFERENCE);
  assert.deepEqual(readStoredThemePreference(null), DEFAULT_THEME_PREFERENCE);
});

test("theme preview colors come from the active palette", () => {
  const vanillaDarkPreview = getThemePreview("vanilla", "dark");
  const pistachioLightPreview = getThemePreview("pistachio", "light");

  assert.notEqual(vanillaDarkPreview.background, pistachioLightPreview.background);
  assert.notEqual(vanillaDarkPreview.foreground, pistachioLightPreview.foreground);
});
