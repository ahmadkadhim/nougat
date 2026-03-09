import { Link, useNavigate } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";

export function AppShell({
  children,
  subtitle,
  title
}: {
  children: React.ReactNode;
  subtitle?: string;
  title: string;
}) {
  const navigate = useNavigate();

  async function handleSignOut() {
    await authClient.signOut();
    await navigate({ to: "/sign-in", search: { redirect: undefined }, replace: true });
  }

  return (
    <main className="dashboard-page">
      <header className="app-shell-header panel">
        <div className="app-shell-copy">
          <p className="eyebrow">Nougat</p>
          <h1>{title}</h1>
          {subtitle ? <p className="lede">{subtitle}</p> : null}
        </div>

        <div className="app-shell-actions">
          <nav className="app-shell-nav" aria-label="Primary">
            <Link activeProps={{ className: "active" }} to="/dashboard">
              Home
            </Link>
            <Link activeProps={{ className: "active" }} to="/review">
              Review
            </Link>
            <Link activeProps={{ className: "active" }} to="/tasks">
              Tasks
            </Link>
            <Link activeProps={{ className: "active" }} to="/knowledge">
              Knowledge
            </Link>
            <Link activeProps={{ className: "active" }} to="/resources">
              Resources
            </Link>
            <Link activeProps={{ className: "active" }} to="/skills">
              Skills
            </Link>
          </nav>
          <button className="secondary-button" onClick={handleSignOut} type="button">
            Sign out
          </button>
        </div>
      </header>

      {children}
    </main>
  );
}
