import { DEFAULT_THEME_PREFERENCE, normalizeThemePreference, type ThemePreference } from "../../src/lib/theme-config.ts";

export type StoredThemePreference = ThemePreference & {
  createdAt: number;
  ownerAuthUserId: string;
  updatedAt: number;
};

export function buildStoredThemePreference(
  input: unknown,
  ownerAuthUserId: string,
  now: number,
  existing?: Pick<StoredThemePreference, "createdAt"> | null
): StoredThemePreference {
  const normalizedPreference = normalizeThemePreference(input);

  return {
    ...normalizedPreference,
    createdAt: existing?.createdAt ?? now,
    ownerAuthUserId,
    updatedAt: now
  };
}

export function getDefaultThemePreference(): ThemePreference {
  return DEFAULT_THEME_PREFERENCE;
}
