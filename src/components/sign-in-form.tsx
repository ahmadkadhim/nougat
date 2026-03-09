import { startTransition, useState } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";

type Mode = "sign-in" | "sign-up";

export function SignInForm({ redirectTo }: { redirectTo?: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submitLabel = mode === "sign-in" ? "Sign in" : "Create account";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    startTransition(async () => {
      try {
        if (mode === "sign-up") {
          const result = await authClient.signUp.email({
            email,
            password,
            name
          });

          if (result.error) {
            throw new Error(result.error.message ?? "Unable to create account");
          }
        } else {
          const result = await authClient.signIn.email({
            email,
            password
          });

          if (result.error) {
            throw new Error(result.error.message ?? "Unable to sign in");
          }
        }

        if (redirectTo) {
          router.history.push(redirectTo);
          return;
        }

        await navigate({ to: "/dashboard", replace: true });
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : "Unexpected authentication error");
      } finally {
        setPending(false);
      }
    });
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <p className="eyebrow">Nougat</p>
          <h1>Personal knowledge capture with real ownership.</h1>
          <p className="lede">
            Sign in to manage X sync, inspect capture health, and grow this into the real product shell instead of a local-only operator tool.
          </p>
        </div>

        <div className="auth-panel">
          <div className="auth-toggle">
            <button
              className={mode === "sign-in" ? "active" : ""}
              onClick={() => setMode("sign-in")}
              type="button"
            >
              Sign in
            </button>
            <button
              className={mode === "sign-up" ? "active" : ""}
              onClick={() => setMode("sign-up")}
              type="button"
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "sign-up" ? (
              <label>
                Name
                <input onChange={(event) => setName(event.target.value)} required type="text" value={name} />
              </label>
            ) : null}

            <label>
              Email
              <input
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>

            <label>
              Password
              <input
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>

            {error ? <p className="auth-error">{error}</p> : null}

            <button className="auth-submit" disabled={pending} type="submit">
              {pending ? "Working..." : submitLabel}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
