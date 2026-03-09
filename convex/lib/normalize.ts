const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
  "mc_cid",
  "mc_eid"
]);

export function normalizeUrl(sourceUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return sourceUrl.trim();
  }

  parsed.hash = "";
  const nextParams = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    if (!TRACKING_PARAMS.has(key.toLowerCase())) {
      nextParams.append(key, value);
    }
  }
  parsed.search = nextParams.toString();

  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = "";
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  parsed.hostname = parsed.hostname.toLowerCase();

  return parsed.toString();
}

export function detectPlatform(sourceUrl: string, platformHint?: string): string {
  if (platformHint) return platformHint.toLowerCase();

  const host = safeHost(sourceUrl);
  if (!host) return "web";
  if (host.includes("x.com") || host.includes("twitter.com")) return "x";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
  if (host.includes("linkedin.com")) return "linkedin";
  if (host.includes("substack.com")) return "substack";
  return "web";
}

export function extractPlatformIds(sourceUrl: string, platform: string): Record<string, unknown> {
  const parsed = safeUrl(sourceUrl);
  if (!parsed) return {};

  if (platform === "x") {
    const match = parsed.pathname.match(/\/(?:i\/web\/)?status\/(\d+)/);
    if (match) return { tweet_id: match[1] };
  }

  if (platform === "youtube") {
    if (parsed.hostname.includes("youtu.be")) {
      const videoId = parsed.pathname.slice(1);
      return videoId ? { video_id: videoId } : {};
    }

    const videoId = parsed.searchParams.get("v");
    if (videoId) return { video_id: videoId };
  }

  return {};
}

function safeUrl(sourceUrl: string): URL | null {
  try {
    return new URL(sourceUrl);
  } catch {
    return null;
  }
}

function safeHost(sourceUrl: string): string | null {
  const parsed = safeUrl(sourceUrl);
  return parsed?.hostname.toLowerCase() ?? null;
}

export function captureBucket(capturedAt: number, windowMs = 10 * 60 * 1000): number {
  return Math.floor(capturedAt / windowMs);
}

export function deterministicMarkdownPath(input: {
  capturedAt: number;
  platform: string;
  captureId: string;
}): string {
  const date = new Date(input.capturedAt);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `nougat/${year}/${month}/${day}/${input.platform}-${input.captureId}.md`;
}
