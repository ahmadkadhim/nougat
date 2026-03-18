import { createContext, startTransition, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "../lib/auth-client";
import {
  DEFAULT_THEME_PREFERENCE,
  applyThemeToDocument,
  getSystemThemePreference,
  normalizeThemePreference,
  preferencesEqual,
  readThemePreferenceFromStorage,
  resolveThemeMode,
  writeThemePreferenceToStorage,
  type ResolvedThemeMode,
  type ThemeMode,
  type ThemeName,
  type ThemePreference
} from "../lib/theme-config";
import type { TypographyName } from "../lib/theme-config";

type ThemeContextValue = {
  isSavingThemePreference: boolean;
  resolvedThemeMode: ResolvedThemeMode;
  themePreference: ThemePreference;
  updateThemeMode: (themeMode: ThemeMode) => void;
  updateThemeName: (themeName: ThemeName) => void;
  updateTypographyName: (typographyName: TypographyName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession();
  const isAuthenticated = Boolean(session?.user);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    typeof window === "undefined" ? DEFAULT_THEME_PREFERENCE : readThemePreferenceFromStorage()
  );
  const [prefersDark, setPrefersDark] = useState<boolean>(() => getSystemThemePreference());
  const hasHydratedServerPreferenceRef = useRef(false);
  const pendingPreferenceRef = useRef<ThemePreference | null>(null);
  const serverPreference = useQuery(api.preferences.getUserPreferences, isAuthenticated ? {} : "skip");
  const saveThemePreference = useMutation(api.preferences.setThemePreference);
  const resolvedThemeMode = resolveThemeMode(themePreference.themeMode, prefersDark);
  const [isSavingThemePreference, setIsSavingThemePreference] = useState(false);

  useEffect(() => {
    applyThemeToDocument(themePreference, prefersDark);
    writeThemePreferenceToStorage(themePreference);
  }, [prefersDark, themePreference]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    setPrefersDark(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      hasHydratedServerPreferenceRef.current = false;
      pendingPreferenceRef.current = null;
      setIsSavingThemePreference(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!serverPreference) {
      return;
    }

    const normalizedServerPreference = normalizeThemePreference(serverPreference);
    const pendingPreference = pendingPreferenceRef.current;
    const serverMatchesPending = pendingPreference ? preferencesEqual(normalizedServerPreference, pendingPreference) : false;

    if (pendingPreference && serverMatchesPending) {
      pendingPreferenceRef.current = null;
      hasHydratedServerPreferenceRef.current = true;
      setIsSavingThemePreference(false);
      setThemePreference((currentPreference) =>
        preferencesEqual(currentPreference, normalizedServerPreference) ? currentPreference : normalizedServerPreference
      );
      writeThemePreferenceToStorage(normalizedServerPreference);
      return;
    }

    if (pendingPreference && !serverMatchesPending) {
      return;
    }

    if (!hasHydratedServerPreferenceRef.current) {
      hasHydratedServerPreferenceRef.current = true;
      setThemePreference((currentPreference) =>
        preferencesEqual(currentPreference, normalizedServerPreference) ? currentPreference : normalizedServerPreference
      );
      writeThemePreferenceToStorage(normalizedServerPreference);
    }
  }, [serverPreference]);

  const persistPreference = useEffectEvent((nextPreference: ThemePreference) => {
    if (!isAuthenticated) {
      return;
    }

    pendingPreferenceRef.current = nextPreference;
    setIsSavingThemePreference(true);

    startTransition(async () => {
      try {
        const savedPreference = normalizeThemePreference(await saveThemePreference(nextPreference));
        setThemePreference(savedPreference);
        writeThemePreferenceToStorage(savedPreference);
      } catch {
        pendingPreferenceRef.current = null;

        if (serverPreference) {
          const normalizedServerPreference = normalizeThemePreference(serverPreference);
          setThemePreference(normalizedServerPreference);
          writeThemePreferenceToStorage(normalizedServerPreference);
        }
      } finally {
        setIsSavingThemePreference(false);
      }
    });
  });

  const updateThemePreference = useEffectEvent((nextPreference: ThemePreference) => {
    if (preferencesEqual(themePreference, nextPreference)) {
      return;
    }

    setThemePreference(nextPreference);
    writeThemePreferenceToStorage(nextPreference);
    persistPreference(nextPreference);
  });

  const updateThemeName = useEffectEvent((themeName: ThemeName) => {
    updateThemePreference({
      ...themePreference,
      themeName
    });
  });

  const updateThemeMode = useEffectEvent((themeMode: ThemeMode) => {
    updateThemePreference({
      ...themePreference,
      themeMode
    });
  });

  const updateTypographyName = useEffectEvent((typographyName: TypographyName) => {
    updateThemePreference({
      ...themePreference,
      typographyName
    });
  });

  return (
    <ThemeContext.Provider
      value={{
        isSavingThemePreference,
        resolvedThemeMode,
        themePreference,
        updateThemeMode,
        updateThemeName,
        updateTypographyName
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
