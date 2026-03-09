const DEFAULT_SCOPES = ["bookmark.read", "tweet.read", "users.read", "offline.access"] as const;

export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const verifier = toBase64Url(verifierBytes);

  const verifierData = new TextEncoder().encode(verifier);
  const challengeDigest = await crypto.subtle.digest("SHA-256", verifierData);
  const challenge = toBase64Url(new Uint8Array(challengeDigest));
  return { verifier, challenge };
}

export function createOAuthState(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function buildXAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes?: string[];
}): string {
  const url = new URL("https://twitter.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", (input.scopes ?? [...DEFAULT_SCOPES]).join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function defaultXScopes(): string[] {
  return [...DEFAULT_SCOPES];
}

export function parseScope(scope?: string): string[] {
  return (scope ?? "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
