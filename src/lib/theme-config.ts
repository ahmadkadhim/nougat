export const THEME_NAMES = ["almond", "vanilla", "hazelnut", "pistachio", "rose", "nutella", "gumdrop"] as const;
export const THEME_MODES = ["light", "dark", "system"] as const;
export const TYPOGRAPHY_NAMES = ["serif", "grotesque", "technical"] as const;
export const THEME_STORAGE_KEY = "nougat.themePreference";

export type ThemeName = (typeof THEME_NAMES)[number];
export type ThemeMode = (typeof THEME_MODES)[number];
export type TypographyName = (typeof TYPOGRAPHY_NAMES)[number];
export type ResolvedThemeMode = "light" | "dark";
export type ThemePreference = {
  themeMode: ThemeMode;
  themeName: ThemeName;
  typographyName: TypographyName;
};

type ThemeSeed = {
  accent: string;
  accentStrong: string;
  avatarEnd: string;
  avatarStart: string;
  bg: string;
  bgDeep: string;
  glowA: string;
  glowB: string;
  ink: string;
  muted: string;
  panel: string;
  xAvatarEnd?: string;
  xAvatarStart?: string;
  xAccent?: string;
  xMediaBg?: string;
  xMuted?: string;
  xText?: string;
};

export type ThemeTokens = {
  accent: string;
  accentSoft: string;
  accentStrong: string;
  authBorder: string;
  authGlow: string;
  authGlowTransparent: string;
  authSheenEnd: string;
  authSheenStart: string;
  avatarEnd: string;
  avatarStart: string;
  backdrop: string;
  bg: string;
  bgDeep: string;
  bgRadialA: string;
  bgRadialB: string;
  buttonNeutral: string;
  buttonNeutralHover: string;
  danger: string;
  dangerSoft: string;
  fieldBg: string;
  fieldBgStrong: string;
  fieldBorder: string;
  focusRing: string;
  info: string;
  infoSoft: string;
  ink: string;
  line: string;
  lineStrong: string;
  menuBg: string;
  menuShadow: string;
  muted: string;
  panel: string;
  panelFloat: string;
  panelMuted: string;
  panelStrong: string;
  reviewSectionBase: string;
  reviewSectionEnd: string;
  reviewSectionStart: string;
  reviewSidebarEnd: string;
  reviewSidebarStart: string;
  shadow: string;
  shadowStrong: string;
  success: string;
  successSoft: string;
  surfaceActive: string;
  surfaceGhost: string;
  surfaceHover: string;
  surfaceSubtle: string;
  textInverse: string;
  xAccent: string;
  xAccentSoft: string;
  xAvatarEnd: string;
  xAvatarStart: string;
  xCardBg: string;
  xCardBorder: string;
  xMediaBg: string;
  xMuted: string;
  xText: string;
};

export type TypographyTokens = {
  bodyFont: string;
  displayFont: string;
  uiFont: string;
};

export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  themeMode: "system",
  themeName: "vanilla",
  typographyName: "serif"
};

const LIGHT_STATUS = {
  danger: "#8a1f14",
  info: "#1d78c1",
  success: "#1f6d3d",
  textInverse: "#fffaf3"
} as const;

const DARK_STATUS = {
  danger: "#ffb0a6",
  info: "#91ccff",
  success: "#9ed7af",
  textInverse: "#15120f"
} as const;

const THEME_SEEDS: Record<ThemeName, Record<ResolvedThemeMode, ThemeSeed>> = {
  almond: {
    light: {
      accent: "#c88a4a",
      accentStrong: "#9b6331",
      avatarEnd: "#9b6331",
      avatarStart: "#d6a566",
      bg: "#f7f1e7",
      bgDeep: "#efe2d0",
      glowA: "#d19a58",
      glowB: "#8c6b45",
      ink: "#221813",
      muted: "#6e5d4c",
      panel: "#fff9f0"
    },
    dark: {
      accent: "#e4bd82",
      accentStrong: "#f0d39c",
      avatarEnd: "#f0d39c",
      avatarStart: "#c99656",
      bg: "#1b1512",
      bgDeep: "#281f1a",
      glowA: "#9a6b3a",
      glowB: "#5f432e",
      ink: "#f4eadf",
      muted: "#c1ad95",
      panel: "#312621"
    }
  },
  vanilla: {
    light: {
      accent: "#c65a1e",
      accentStrong: "#9c4312",
      avatarEnd: "#9c4312",
      avatarStart: "#d78349",
      bg: "#faf7f1",
      bgDeep: "#f1eadf",
      glowA: "#c65a1e",
      glowB: "#1a5144",
      ink: "#171411",
      muted: "#65594f",
      panel: "#fffaf3"
    },
    dark: {
      accent: "#e19652",
      accentStrong: "#f2bc82",
      avatarEnd: "#f2bc82",
      avatarStart: "#c96c2f",
      bg: "#181312",
      bgDeep: "#241c1a",
      glowA: "#b15d24",
      glowB: "#5f5444",
      ink: "#f7eee3",
      muted: "#ccbba8",
      panel: "#2d2321"
    }
  },
  hazelnut: {
    light: {
      accent: "#8f532e",
      accentStrong: "#6e391b",
      avatarEnd: "#6e391b",
      avatarStart: "#bc7b53",
      bg: "#f6efe8",
      bgDeep: "#ead8c8",
      glowA: "#a46037",
      glowB: "#7b5236",
      ink: "#1c1412",
      muted: "#67554d",
      panel: "#fff7f0"
    },
    dark: {
      accent: "#c78960",
      accentStrong: "#e0ae89",
      avatarEnd: "#e0ae89",
      avatarStart: "#99613e",
      bg: "#171210",
      bgDeep: "#231a17",
      glowA: "#875231",
      glowB: "#5a3b2c",
      ink: "#f4ebe5",
      muted: "#c2ada1",
      panel: "#2c211d"
    }
  },
  pistachio: {
    light: {
      accent: "#6e9b62",
      accentStrong: "#507c47",
      avatarEnd: "#507c47",
      avatarStart: "#96bb86",
      bg: "#f7f6ef",
      bgDeep: "#ebe9da",
      glowA: "#6e9b62",
      glowB: "#8a744e",
      ink: "#182014",
      muted: "#617059",
      panel: "#fcfcf6"
    },
    dark: {
      accent: "#a2cb8f",
      accentStrong: "#c2deb5",
      avatarEnd: "#c2deb5",
      avatarStart: "#6a915d",
      bg: "#161715",
      bgDeep: "#20221d",
      glowA: "#628653",
      glowB: "#4e4737",
      ink: "#eef3e8",
      muted: "#b8c4af",
      panel: "#292d26"
    }
  },
  rose: {
    light: {
      accent: "#c97085",
      accentStrong: "#a74f63",
      avatarEnd: "#a74f63",
      avatarStart: "#df93a3",
      bg: "#fbf1f2",
      bgDeep: "#f3dee2",
      glowA: "#c97085",
      glowB: "#8c5a67",
      ink: "#211517",
      muted: "#72545b",
      panel: "#fff8f8"
    },
    dark: {
      accent: "#ea9bad",
      accentStrong: "#f3c0cb",
      avatarEnd: "#f3c0cb",
      avatarStart: "#af6678",
      bg: "#1a1315",
      bgDeep: "#251a1e",
      glowA: "#9c586a",
      glowB: "#5b3f47",
      ink: "#f6ebee",
      muted: "#c8b0b7",
      panel: "#2e2327"
    }
  },
  nutella: {
    light: {
      accent: "#7b4627",
      accentStrong: "#5c2913",
      avatarEnd: "#5c2913",
      avatarStart: "#ab6e49",
      bg: "#f3ebe5",
      bgDeep: "#e4d3c4",
      glowA: "#8e5633",
      glowB: "#6b4a37",
      ink: "#1b1412",
      muted: "#66544d",
      panel: "#fbf5f0"
    },
    dark: {
      accent: "#ba7e59",
      accentStrong: "#e0ab86",
      avatarEnd: "#e0ab86",
      avatarStart: "#8c5638",
      bg: "#150f0d",
      bgDeep: "#211715",
      glowA: "#79492f",
      glowB: "#4f362b",
      ink: "#f5ece7",
      muted: "#c9b3a7",
      panel: "#291d1a"
    }
  },
  gumdrop: {
    light: {
      accent: "#7a8bd1",
      accentStrong: "#5665a7",
      avatarEnd: "#6579b8",
      avatarStart: "#8ad0cf",
      bg: "#f6f4f8",
      bgDeep: "#e8e1ef",
      glowA: "#7a8bd1",
      glowB: "#67aeb4",
      ink: "#1b1822",
      muted: "#625b6f",
      panel: "#fcfbff"
    },
    dark: {
      accent: "#aeb7ff",
      accentStrong: "#ced4ff",
      avatarEnd: "#ced4ff",
      avatarStart: "#7fa6d9",
      bg: "#15141a",
      bgDeep: "#1f1c27",
      glowA: "#7783d1",
      glowB: "#4f657f",
      ink: "#f2eff8",
      muted: "#bfb8cb",
      panel: "#292633"
    }
  }
};

export const THEME_LABELS: Record<ThemeName, string> = {
  almond: "Almond",
  vanilla: "Vanilla",
  hazelnut: "Hazelnut",
  pistachio: "Pistachio",
  rose: "Rose",
  nutella: "Nutella",
  gumdrop: "Gumdrop"
};

export const THEME_OPTIONS = THEME_NAMES.map((name) => ({
  label: THEME_LABELS[name],
  name
}));

export const THEME_MODE_LABELS: Record<ThemeMode, string> = {
  dark: "Dark",
  light: "Light",
  system: "System"
};

export const TYPOGRAPHY_LABELS: Record<TypographyName, string> = {
  grotesque: "Friendly Grotesque",
  serif: "Elegant Serif",
  technical: "Technical Dense"
};

export const TYPOGRAPHY_DESCRIPTIONS: Record<TypographyName, string> = {
  grotesque: "DM Sans for easy, warm UI copy.",
  serif: "Literata with a bookish, readable cadence.",
  technical: "IBM Plex with a tighter systems feel."
};

export const TYPOGRAPHY_OPTIONS = TYPOGRAPHY_NAMES.map((name) => ({
  description: TYPOGRAPHY_DESCRIPTIONS[name],
  label: TYPOGRAPHY_LABELS[name],
  name
}));

export const TYPOGRAPHY_TOKENS: Record<TypographyName, TypographyTokens> = {
  grotesque: {
    bodyFont: '"DM Sans", "Helvetica Neue", Arial, sans-serif',
    displayFont: '"DM Sans", "Helvetica Neue", Arial, sans-serif',
    uiFont: '"DM Sans", "Helvetica Neue", Arial, sans-serif'
  },
  serif: {
    bodyFont: '"Literata", "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
    displayFont: '"Literata", "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
    uiFont: '"DM Sans", "Helvetica Neue", Arial, sans-serif'
  },
  technical: {
    bodyFont: '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
    displayFont: '"IBM Plex Sans Condensed", "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
    uiFont: '"IBM Plex Sans Condensed", "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif'
  }
};

export const THEME_TOKENS: Record<ThemeName, Record<ResolvedThemeMode, ThemeTokens>> = Object.fromEntries(
  THEME_NAMES.map((themeName) => [
    themeName,
    {
      dark: buildThemeTokens(THEME_SEEDS[themeName].dark, "dark"),
      light: buildThemeTokens(THEME_SEEDS[themeName].light, "light")
    }
  ])
) as Record<ThemeName, Record<ResolvedThemeMode, ThemeTokens>>;

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEME_NAMES as readonly string[]).includes(value);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

export function isTypographyName(value: unknown): value is TypographyName {
  return typeof value === "string" && (TYPOGRAPHY_NAMES as readonly string[]).includes(value);
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  if (!value || typeof value !== "object") {
    return DEFAULT_THEME_PREFERENCE;
  }

  const candidate = value as Partial<ThemePreference>;

  return {
    themeMode: isThemeMode(candidate.themeMode) ? candidate.themeMode : DEFAULT_THEME_PREFERENCE.themeMode,
    themeName: isThemeName(candidate.themeName) ? candidate.themeName : DEFAULT_THEME_PREFERENCE.themeName,
    typographyName: isTypographyName(candidate.typographyName) ? candidate.typographyName : DEFAULT_THEME_PREFERENCE.typographyName
  };
}

export function preferencesEqual(left: ThemePreference, right: ThemePreference): boolean {
  return left.themeMode === right.themeMode && left.themeName === right.themeName && left.typographyName === right.typographyName;
}

export function resolveThemeMode(themeMode: ThemeMode, prefersDark: boolean): ResolvedThemeMode {
  if (themeMode === "system") {
    return prefersDark ? "dark" : "light";
  }

  return themeMode;
}

export function getThemeTokens(themeName: ThemeName, resolvedThemeMode: ResolvedThemeMode): ThemeTokens {
  return THEME_TOKENS[themeName][resolvedThemeMode];
}

export function getThemePreview(themeName: ThemeName, resolvedThemeMode: ResolvedThemeMode): { background: string; foreground: string } {
  const tokens = getThemeTokens(themeName, resolvedThemeMode);
  return {
    background: tokens.bg,
    foreground: tokens.accentStrong
  };
}

export function getThemeModeLabel(themeMode: ThemeMode): string {
  return THEME_MODE_LABELS[themeMode];
}

export function getThemeLabel(themeName: ThemeName): string {
  return THEME_LABELS[themeName];
}

export function getTypographyLabel(typographyName: TypographyName): string {
  return TYPOGRAPHY_LABELS[typographyName];
}

export function getTypographyTokens(typographyName: TypographyName): TypographyTokens {
  return TYPOGRAPHY_TOKENS[typographyName];
}

export function getSystemThemePreference(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function readStoredThemePreference(rawValue: string | null | undefined): ThemePreference {
  if (!rawValue) {
    return DEFAULT_THEME_PREFERENCE;
  }

  try {
    return normalizeThemePreference(JSON.parse(rawValue));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function readThemePreferenceFromStorage(): ThemePreference {
  if (typeof window === "undefined") {
    return DEFAULT_THEME_PREFERENCE;
  }

  return readStoredThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function writeThemePreferenceToStorage(preference: ThemePreference) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(preference));
}

export function applyThemeToDocument(preference: ThemePreference, prefersDark: boolean) {
  if (typeof document === "undefined") {
    return resolveThemeMode(preference.themeMode, prefersDark);
  }

  const resolvedThemeMode = resolveThemeMode(preference.themeMode, prefersDark);
  const themeTokens = getThemeTokens(preference.themeName, resolvedThemeMode);
  const typographyTokens = getTypographyTokens(preference.typographyName);
  const root = document.documentElement;

  for (const [tokenName, tokenValue] of Object.entries(themeTokens)) {
    root.style.setProperty(`--${toKebabCase(tokenName)}`, tokenValue);
  }

  for (const [tokenName, tokenValue] of Object.entries(typographyTokens)) {
    root.style.setProperty(`--${toKebabCase(tokenName)}`, tokenValue);
  }

  root.dataset.themeMode = preference.themeMode;
  root.dataset.themeName = preference.themeName;
  root.dataset.themeResolvedMode = resolvedThemeMode;
  root.dataset.typography = preference.typographyName;
  root.style.colorScheme = resolvedThemeMode;

  return resolvedThemeMode;
}

export function createThemeBootScript(): string {
  const scriptPayload = JSON.stringify({
    defaultPreference: DEFAULT_THEME_PREFERENCE,
    storageKey: THEME_STORAGE_KEY,
    themeTokens: THEME_TOKENS,
    typographyTokens: TYPOGRAPHY_TOKENS
  });

  return `(() => {
  const payload = ${scriptPayload};
  const themeNames = Object.keys(payload.themeTokens);
  const themeModes = ["light", "dark", "system"];
  const typographyNames = Object.keys(payload.typographyTokens);
  const toKebabCase = (value) => value.replace(/[A-Z]/g, (match) => "-" + match.toLowerCase());
  const normalizePreference = (input) => {
    const themeName = themeNames.includes(input?.themeName) ? input.themeName : payload.defaultPreference.themeName;
    const themeMode = themeModes.includes(input?.themeMode) ? input.themeMode : payload.defaultPreference.themeMode;
    const typographyName = typographyNames.includes(input?.typographyName) ? input.typographyName : payload.defaultPreference.typographyName;
    return { themeMode, themeName, typographyName };
  };
  const readPreference = () => {
    try {
      const raw = window.localStorage.getItem(payload.storageKey);
      return raw ? normalizePreference(JSON.parse(raw)) : payload.defaultPreference;
    } catch {
      return payload.defaultPreference;
    }
  };
  const preference = normalizePreference(readPreference());
  const resolvedThemeMode =
    preference.themeMode === "system"
      ? window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference.themeMode;
  const themeTokens = payload.themeTokens[preference.themeName][resolvedThemeMode];
  const typographyTokens = payload.typographyTokens[preference.typographyName];
  const root = document.documentElement;
  for (const [tokenName, tokenValue] of Object.entries(themeTokens)) {
    root.style.setProperty("--" + toKebabCase(tokenName), tokenValue);
  }
  for (const [tokenName, tokenValue] of Object.entries(typographyTokens)) {
    root.style.setProperty("--" + toKebabCase(tokenName), tokenValue);
  }
  root.dataset.themeMode = preference.themeMode;
  root.dataset.themeName = preference.themeName;
  root.dataset.themeResolvedMode = resolvedThemeMode;
  root.dataset.typography = preference.typographyName;
  root.style.colorScheme = resolvedThemeMode;
})();`;
}

function buildThemeTokens(themeSeed: ThemeSeed, resolvedThemeMode: ResolvedThemeMode): ThemeTokens {
  const statusTokens = resolvedThemeMode === "dark" ? DARK_STATUS : LIGHT_STATUS;

  return {
    accent: themeSeed.accent,
    accentSoft: toRgba(themeSeed.accent, 0.12),
    accentStrong: themeSeed.accentStrong,
    authBorder: toRgba(themeSeed.accent, 0.16),
    authGlow: toRgba(themeSeed.accent, 0.14),
    authGlowTransparent: toRgba(themeSeed.accent, 0),
    authSheenEnd: toRgba(themeSeed.bg, 0.58),
    authSheenStart: toRgba(themeSeed.panel, 0.68),
    avatarEnd: themeSeed.avatarEnd,
    avatarStart: themeSeed.avatarStart,
    backdrop: toRgba(themeSeed.bgDeep, 0.82),
    bg: themeSeed.bg,
    bgDeep: themeSeed.bgDeep,
    bgRadialA: toRgba(themeSeed.glowA, 0.14),
    bgRadialB: toRgba(themeSeed.glowB, 0.1),
    buttonNeutral: toRgba(themeSeed.ink, 0.08),
    buttonNeutralHover: toRgba(themeSeed.ink, 0.12),
    danger: statusTokens.danger,
    dangerSoft: toRgba(statusTokens.danger, 0.12),
    fieldBg: toRgba(themeSeed.panel, 0.75),
    fieldBgStrong: toRgba(themeSeed.panel, 0.92),
    fieldBorder: toRgba(themeSeed.ink, 0.12),
    focusRing: `0 0 0 10px ${toRgba(themeSeed.accent, 0.15)}`,
    info: statusTokens.info,
    infoSoft: toRgba(statusTokens.info, 0.12),
    ink: themeSeed.ink,
    line: toRgba(themeSeed.ink, 0.12),
    lineStrong: toRgba(themeSeed.ink, 0.18),
    menuBg: toRgba(themeSeed.panel, 0.98),
    menuShadow: `0 18px 40px ${toRgba(themeSeed.ink, 0.12)}`,
    muted: themeSeed.muted,
    panel: toRgba(themeSeed.panel, 0.84),
    panelFloat: toRgba(themeSeed.panel, 0.96),
    panelMuted: toRgba(themeSeed.panel, 0.72),
    panelStrong: themeSeed.panel,
    reviewSectionBase: toRgba(themeSeed.panel, 0.5),
    reviewSectionEnd: toRgba(themeSeed.bgDeep, 0.7),
    reviewSectionStart: toRgba(themeSeed.panel, 0.78),
    reviewSidebarEnd: toRgba(themeSeed.bgDeep, 0.78),
    reviewSidebarStart: toRgba(themeSeed.panel, 0.82),
    shadow: `0 24px 60px ${toRgba(themeSeed.ink, 0.12)}`,
    shadowStrong: `0 28px 80px ${toRgba(themeSeed.ink, 0.16)}`,
    success: statusTokens.success,
    successSoft: toRgba(statusTokens.success, 0.12),
    surfaceActive: toRgba(themeSeed.ink, 0.08),
    surfaceGhost: toRgba(themeSeed.ink, 0.04),
    surfaceHover: toRgba(themeSeed.ink, 0.05),
    surfaceSubtle: toRgba(themeSeed.ink, 0.06),
    textInverse: statusTokens.textInverse,
    xAccent: themeSeed.xAccent ?? themeSeed.accent,
    xAccentSoft: toRgba(themeSeed.xAccent ?? themeSeed.accent, 0.12),
    xAvatarEnd: themeSeed.xAvatarEnd ?? themeSeed.avatarEnd,
    xAvatarStart: themeSeed.xAvatarStart ?? themeSeed.avatarStart,
    xCardBg: toRgba(themeSeed.panel, 0.9),
    xCardBorder: toRgba(themeSeed.xText ?? themeSeed.ink, 0.12),
    xMediaBg: themeSeed.xMediaBg ?? toRgba(themeSeed.accent, 0.18),
    xMuted: themeSeed.xMuted ?? themeSeed.muted,
    xText: themeSeed.xText ?? themeSeed.ink
  };
}

function toRgba(hexColor: string, alpha: number): string {
  const normalized = hexColor.replace("#", "");
  const safeHex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalized;

  const red = Number.parseInt(safeHex.slice(0, 2), 16);
  const green = Number.parseInt(safeHex.slice(2, 4), 16);
  const blue = Number.parseInt(safeHex.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}
