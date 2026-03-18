import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "../lib/auth-client";
import { createLoggedOutAuthSnapshot, setClientAuthSnapshot } from "../lib/auth-session";
import {
  THEME_MODES,
  THEME_OPTIONS,
  getThemeLabel,
  getThemeModeLabel,
  getThemePreview,
  getTypographyLabel,
  getTypographyTokens,
  TYPOGRAPHY_OPTIONS
} from "../lib/theme-config";
import { useRetainedValue } from "../lib/use-retained-value";
import nougatExtensionIcon from "../assets/nougat-extension-icon.png";
import { useTheme } from "./theme-provider";

export function AppShell({
  children
}: {
  chromeStyle?: "workspace";
  children: React.ReactNode;
  subtitle?: string;
  title?: string;
}) {
  const navigate = useNavigate();
  const pendingReview = useQuery(api.derived.getHasPendingReview, {});
  const migrationStatus = useQuery(api.derived.getNotesMigrationStatus, {});
  const retainedPendingReview = useRetainedValue(pendingReview);
  const retainedMigrationStatus = useRetainedValue(migrationStatus);
  const bootstrapNotesMigration = useMutation(api.derived.bootstrapNotesMigration);
  const { data: session } = authClient.useSession();
  const { isSavingThemePreference, resolvedThemeMode, themePreference, updateThemeMode, updateThemeName, updateTypographyName } =
    useTheme();
  const accountName = session?.user?.name?.trim() || session?.user?.email || "Nougat";
  const avatarInitial = accountName.charAt(0).toUpperCase();
  const attemptedMigrationRef = useRef(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [openAppearancePanel, setOpenAppearancePanel] = useState<"theme" | "typography" | null>(null);
  const activeThemePreview = getThemePreview(themePreference.themeName, resolvedThemeMode);
  const activeTypographyTokens = getTypographyTokens(themePreference.typographyName);
  const isThemeMenuOpen = openAppearancePanel === "theme";
  const isTypographyMenuOpen = openAppearancePanel === "typography";

  useEffect(() => {
    if (!retainedMigrationStatus?.needsMigration || attemptedMigrationRef.current) {
      return;
    }
    attemptedMigrationRef.current = true;
    void bootstrapNotesMigration({});
  }, [bootstrapNotesMigration, retainedMigrationStatus?.needsMigration]);

  async function handleSignOut() {
    await authClient.signOut();
    setClientAuthSnapshot(createLoggedOutAuthSnapshot());
    await navigate({ to: "/sign-in", search: { redirect: undefined }, replace: true });
  }

  const closeAccountMenu = useEffectEvent(() => {
    setIsAccountMenuOpen(false);
    setOpenAppearancePanel(null);
  });

  const handleDocumentPointerDown = useEffectEvent((event: PointerEvent) => {
    if (!accountMenuRef.current?.contains(event.target as Node)) {
      closeAccountMenu();
    }
  });

  const handleWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closeAccountMenu();
    }
  });

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [handleDocumentPointerDown, handleWindowKeyDown, isAccountMenuOpen]);

  return (
    <main className="dashboard-page workspace-page">
      <header className="app-shell-header workspace-header">
        <Link className="app-brand" to="/dashboard">
          <img alt="Nougat icon" className="app-brand-icon" src={nougatExtensionIcon} />
          <span className="app-brand-word">Nougat</span>
        </Link>
        <div className="app-shell-actions">
          <nav className="app-shell-nav" aria-label="Primary">
            <Link activeProps={{ className: "active" }} to="/dashboard">
              Home
            </Link>
            <Link activeProps={{ className: "active" }} to="/review">
              Review
              {retainedPendingReview?.hasPendingReview ? (
                <span aria-label="Pending review items" className="nav-count nav-count-dot">
                  •
                </span>
              ) : null}
            </Link>
            <Link activeProps={{ className: "active" }} to="/tasks">
              Tasks
            </Link>
            <Link activeProps={{ className: "active" }} to="/notes">
              Notes
            </Link>
            <Link activeProps={{ className: "active" }} to="/resources">
              Resources
            </Link>
            <Link activeProps={{ className: "active" }} to="/skills">
              Skills
            </Link>
          </nav>
          <div className="account-menu" ref={accountMenuRef}>
            <button
              aria-expanded={isAccountMenuOpen}
              aria-haspopup="menu"
              className="account-trigger"
              onClick={() =>
                setIsAccountMenuOpen((open) => {
                  if (open) {
                    setOpenAppearancePanel(null);
                  }

                  return !open;
                })
              }
              type="button"
            >
              <span aria-hidden="true" className="account-avatar">
                {avatarInitial}
              </span>
              <span aria-hidden="true" className="account-chevron">
                ▾
              </span>
            </button>
            {isAccountMenuOpen ? (
              <div aria-label="Account" className="account-menu-popover" role="menu">
                <div className="account-menu-meta">
                  <p className="account-menu-name">{session?.user?.name || "Account"}</p>
                  {session?.user?.email ? <p className="account-menu-email">{session.user.email}</p> : null}
                </div>
                <button
                  aria-expanded={isThemeMenuOpen}
                  className={`account-menu-item account-menu-item-split ${isThemeMenuOpen ? "is-open" : ""}`}
                  onClick={() => setOpenAppearancePanel((open) => (open === "theme" ? null : "theme"))}
                  type="button"
                >
                  <span className="account-menu-item-copy">
                    <span className="account-menu-item-label">Theme</span>
                    <span className="account-menu-item-description">
                      {getThemeLabel(themePreference.themeName)} · {getThemeModeLabel(themePreference.themeMode)}
                    </span>
                  </span>
                  <span className="account-menu-item-trailing">
                    <ThemeSwatch background={activeThemePreview.background} foreground={activeThemePreview.foreground} />
                    <span aria-hidden="true" className="account-menu-item-caret">
                      ›
                    </span>
                  </span>
                </button>
                {isThemeMenuOpen ? (
                  <div className="theme-submenu">
                    <div className="theme-mode-toggle" role="group" aria-label="Theme mode">
                      {THEME_MODES.map((themeMode) => (
                        <button
                          className={themePreference.themeMode === themeMode ? "active" : ""}
                          key={themeMode}
                          onClick={() => updateThemeMode(themeMode)}
                          type="button"
                        >
                          {getThemeModeLabel(themeMode)}
                        </button>
                      ))}
                    </div>
                    <div className="theme-option-list" role="group" aria-label="Theme family">
                      {THEME_OPTIONS.map((themeOption) => {
                        const optionPreview = getThemePreview(themeOption.name, resolvedThemeMode);
                        const isActive = themePreference.themeName === themeOption.name;

                        return (
                          <button
                            className={`theme-option ${isActive ? "is-active" : ""}`}
                            key={themeOption.name}
                            onClick={() => updateThemeName(themeOption.name)}
                            type="button"
                          >
                            <span className="theme-option-copy">
                              <ThemeSwatch background={optionPreview.background} foreground={optionPreview.foreground} />
                              <span>{themeOption.label}</span>
                            </span>
                            <span className="theme-option-meta">{isActive ? "Current" : ""}</span>
                          </button>
                        );
                      })}
                    </div>
                    {isSavingThemePreference ? <p className="account-menu-status">Syncing appearance…</p> : null}
                  </div>
                ) : null}
                <button
                  aria-expanded={isTypographyMenuOpen}
                  className={`account-menu-item account-menu-item-split ${isTypographyMenuOpen ? "is-open" : ""}`}
                  onClick={() => setOpenAppearancePanel((open) => (open === "typography" ? null : "typography"))}
                  type="button"
                >
                  <span className="account-menu-item-copy">
                    <span className="account-menu-item-label">Typography</span>
                    <span className="account-menu-item-description">{getTypographyLabel(themePreference.typographyName)}</span>
                  </span>
                  <span className="account-menu-item-trailing">
                    <TypographySample fontFamily={activeTypographyTokens.displayFont} />
                    <span aria-hidden="true" className="account-menu-item-caret">
                      ›
                    </span>
                  </span>
                </button>
                {isTypographyMenuOpen ? (
                  <div className="theme-submenu">
                    <div className="theme-option-list" role="group" aria-label="Typography family">
                      {TYPOGRAPHY_OPTIONS.map((typographyOption) => {
                        const isActive = themePreference.typographyName === typographyOption.name;
                        const typographyTokens = getTypographyTokens(typographyOption.name);

                        return (
                          <button
                            className={`theme-option typography-option ${isActive ? "is-active" : ""}`}
                            key={typographyOption.name}
                            onClick={() => updateTypographyName(typographyOption.name)}
                            type="button"
                          >
                            <span className="theme-option-copy typography-option-copy">
                              <TypographySample fontFamily={typographyTokens.displayFont} />
                              <span>
                                <span className="typography-option-label">{typographyOption.label}</span>
                                <span className="typography-option-description">{typographyOption.description}</span>
                              </span>
                            </span>
                            <span className="theme-option-meta">{isActive ? "Current" : ""}</span>
                          </button>
                        );
                      })}
                    </div>
                    {isSavingThemePreference ? <p className="account-menu-status">Syncing appearance…</p> : null}
                  </div>
                ) : null}
                <button
                  className="account-menu-item"
                  onClick={async () => {
                    closeAccountMenu();
                    await handleSignOut();
                  }}
                  type="button"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {children}
    </main>
  );
}

function ThemeSwatch({ background, foreground }: { background: string; foreground: string }) {
  return (
    <span
      aria-hidden="true"
      className="theme-swatch"
      style={
        {
          "--theme-swatch-background": background,
          "--theme-swatch-foreground": foreground
        } as CSSProperties
      }
    />
  );
}

function TypographySample({ fontFamily }: { fontFamily: string }) {
  return (
    <span
      aria-hidden="true"
      className="typography-sample"
      style={
        {
          "--typography-sample-font": fontFamily
        } as CSSProperties
      }
    >
      Ag
    </span>
  );
}
