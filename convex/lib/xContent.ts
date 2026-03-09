export interface XUrlEntity {
  url?: string;
  expanded_url?: string;
  unwound_url?: string;
}

export interface XReferencedTweet {
  id?: string;
  type?: string;
}

export interface XArticle {
  id?: string;
  cover_media?: string;
  entities?: {
    urls?: Array<{
      text?: string;
    }>;
  };
  preview_text?: string;
  title?: string;
  url?: string;
  plain_text?: string;
  text?: string;
}

export interface XMedia {
  alt_text?: string;
  media_key?: string;
  preview_image_url?: string;
  type?: string;
  url?: string;
}

export interface XContentTweet {
  attachments?: {
    media_keys?: string[];
  };
  created_at?: string;
  id?: string;
  text?: string;
  author_id?: string;
  note_tweet?: {
    text?: string;
  };
  article?: XArticle;
  entities?: {
    urls?: XUrlEntity[];
  };
  suggested_source_links?: Array<{
    url?: string;
    title?: string;
  }>;
  referenced_tweets?: XReferencedTweet[];
}

export interface XContentUser {
  id?: string;
  name?: string;
  profile_image_url?: string;
  username?: string;
  verified?: boolean;
}

export interface ResolvedTweetUrl {
  domain: string | null;
  displayUrl: string;
  isArticleUrl: boolean;
  isMediaUrl: boolean;
  isQuotedTweetMediaUrl: boolean;
  isXDomainUrl: boolean;
  shortUrl?: string;
  expandedUrl?: string;
  unwoundUrl?: string;
  resolvedUrl: string;
  isXUrl: boolean;
  isQuotedTweetUrl: boolean;
}

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

export function getTweetText(tweet: XContentTweet): string | undefined {
  return readString(tweet.note_tweet?.text) ?? readString(tweet.text) ?? undefined;
}

export function getArticlePlainText(tweet: XContentTweet): string | undefined {
  return readString(tweet.article?.plain_text) ?? readString(tweet.article?.text) ?? undefined;
}

export function getReferencedQuoteTweetId(tweet: XContentTweet): string | undefined {
  return tweet.referenced_tweets?.find((reference) => reference.type === "quoted")?.id;
}

export function getUserDisplayName(user?: XContentUser): string | undefined {
  return readString(user?.name) ?? readString(user?.username) ?? undefined;
}

export function getUserUsername(user?: XContentUser): string | undefined {
  return readString(user?.username) ?? undefined;
}

export function getUserAvatarUrl(user?: XContentUser): string | undefined {
  return readString(user?.profile_image_url) ?? undefined;
}

export function resolveTweetUrls(tweet: XContentTweet, quotedTweetId?: string): ResolvedTweetUrl[] {
  const deduped = new Map<string, ResolvedTweetUrl>();
  const urlEntities = tweet.entities?.urls ?? [];

  for (const entity of urlEntities) {
    const candidate = readString(entity.unwound_url) ?? readString(entity.expanded_url) ?? readString(entity.url);
    if (!candidate) continue;

    const resolvedUrl = normalizeCandidateUrl(candidate);
    const metadata = getResolvedUrlMetadata(resolvedUrl, quotedTweetId);
    const parsed = parseXStatusUrl(resolvedUrl);
    const dedupeKey = `${resolvedUrl}::${readString(entity.url) ?? ""}`;
    deduped.set(dedupeKey, {
      domain: getUrlDomain(resolvedUrl),
      displayUrl: formatDisplayUrl(resolvedUrl),
      isArticleUrl: metadata.isArticleUrl,
      isMediaUrl: metadata.isMediaUrl,
      isQuotedTweetMediaUrl: metadata.isQuotedTweetMediaUrl,
      isXDomainUrl: metadata.isXDomainUrl,
      shortUrl: readString(entity.url) ?? undefined,
      expandedUrl: readString(entity.expanded_url) ?? undefined,
      unwoundUrl: readString(entity.unwound_url) ?? undefined,
      resolvedUrl,
      isXUrl: Boolean(parsed),
      isQuotedTweetUrl: Boolean(quotedTweetId && parsed?.tweetId === quotedTweetId)
    });
  }

  for (const link of tweet.suggested_source_links ?? []) {
    const candidate = readString(link.url);
    if (!candidate) continue;

    const resolvedUrl = normalizeCandidateUrl(candidate);
    const metadata = getResolvedUrlMetadata(resolvedUrl, quotedTweetId);
    const parsed = parseXStatusUrl(resolvedUrl);
    const dedupeKey = `${resolvedUrl}::suggested`;
    deduped.set(dedupeKey, {
      domain: getUrlDomain(resolvedUrl),
      displayUrl: formatDisplayUrl(resolvedUrl),
      isArticleUrl: metadata.isArticleUrl,
      isMediaUrl: metadata.isMediaUrl,
      isQuotedTweetMediaUrl: metadata.isQuotedTweetMediaUrl,
      isXDomainUrl: metadata.isXDomainUrl,
      resolvedUrl,
      isXUrl: Boolean(parsed),
      isQuotedTweetUrl: Boolean(quotedTweetId && parsed?.tweetId === quotedTweetId)
    });
  }

  const articleUrl = readString(tweet.article?.url);
  if (articleUrl) {
    const resolvedUrl = normalizeCandidateUrl(articleUrl);
    const metadata = getResolvedUrlMetadata(resolvedUrl, quotedTweetId);
    const parsed = parseXStatusUrl(resolvedUrl);
    const dedupeKey = `${resolvedUrl}::article`;
    deduped.set(dedupeKey, {
      domain: getUrlDomain(resolvedUrl),
      displayUrl: formatDisplayUrl(resolvedUrl),
      isArticleUrl: metadata.isArticleUrl,
      isMediaUrl: metadata.isMediaUrl,
      isQuotedTweetMediaUrl: metadata.isQuotedTweetMediaUrl,
      isXDomainUrl: metadata.isXDomainUrl,
      resolvedUrl,
      isXUrl: Boolean(parsed),
      isQuotedTweetUrl: Boolean(quotedTweetId && parsed?.tweetId === quotedTweetId)
    });
  }

  return [...deduped.values()];
}

export function getTweetMedia(tweet: XContentTweet, mediaByKey: Map<string, XMedia>): XMedia[] {
  const mediaKeys = tweet.attachments?.media_keys ?? [];
  return mediaKeys
    .map((mediaKey) => mediaByKey.get(mediaKey))
    .filter((media): media is XMedia => Boolean(media));
}

export function getPrimaryMediaPreviewUrl(tweet: XContentTweet, mediaByKey: Map<string, XMedia>): string | undefined {
  const media = getTweetMedia(tweet, mediaByKey);
  for (const item of media) {
    const preview = readString(item.url) ?? readString(item.preview_image_url);
    if (preview) {
      return preview;
    }
  }

  const articleCover = readString(tweet.article?.cover_media);
  if (articleCover) {
    const cover = mediaByKey.get(articleCover);
    const preview = cover ? readString(cover.url) ?? readString(cover.preview_image_url) : null;
    if (preview) {
      return preview;
    }
  }

  return undefined;
}

export function renderTweetDisplayText(tweet: XContentTweet): string | undefined {
  const rawText = getTweetText(tweet);
  if (!rawText) return undefined;

  const replacements = resolveTweetUrls(tweet).map((item) => ({
    shortUrl: item.shortUrl,
    replacement: item.isXDomainUrl ? "" : item.displayUrl
  }));

  let next = rawText;
  for (const item of replacements) {
    if (!item.shortUrl) continue;
    next = next.split(item.shortUrl).join(item.replacement);
  }

  const normalized = next
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized || undefined;
}

export function getTweetArticleUrls(tweet: XContentTweet): string[] {
  return (tweet.article?.entities?.urls ?? [])
    .map((item) => readString(item.text))
    .filter((value): value is string => Boolean(value));
}

export function isOnlyShortLinkText(text?: string): boolean {
  if (!text) return false;
  const stripped = text
    .replace(/\s+/g, " ")
    .trim();
  return /^https:\/\/t\.co\/[A-Za-z0-9]+(?: https:\/\/t\.co\/[A-Za-z0-9]+)*$/.test(stripped);
}

export function extractQuotedAuthorUsernameFromUrls(tweet: XContentTweet, quotedTweetId?: string): string | undefined {
  if (!quotedTweetId) return undefined;

  for (const item of resolveTweetUrls(tweet, quotedTweetId)) {
    const parsed = parseXStatusUrl(item.resolvedUrl);
    if (parsed?.tweetId === quotedTweetId && parsed.username && parsed.username !== "i") {
      return parsed.username;
    }
  }

  return undefined;
}

function parseXStatusUrl(url: string): { username?: string; tweetId: string } | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("x.com") && !host.includes("twitter.com")) {
      return null;
    }

    const match = parsed.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (match) {
      return {
        username: match[1],
        tweetId: match[2]
      };
    }

    const webMatch = parsed.pathname.match(/^\/i\/web\/status\/(\d+)/);
    if (webMatch) {
      return { tweetId: webMatch[1] };
    }

    return null;
  } catch {
    return null;
  }
}

function getResolvedUrlMetadata(
  url: string,
  quotedTweetId?: string
): {
  isArticleUrl: boolean;
  isMediaUrl: boolean;
  isQuotedTweetMediaUrl: boolean;
  isXDomainUrl: boolean;
} {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isXDomainUrl = host.includes("x.com") || host.includes("twitter.com");
    const isArticleUrl = isXDomainUrl && /^\/i\/article\//.test(parsed.pathname);
    const mediaMatch = parsed.pathname.match(/^\/([^/]+)\/status\/(\d+)\/(photo|video)\/\d+/);
    const isMediaUrl = Boolean(mediaMatch);
    const isQuotedTweetMediaUrl = Boolean(quotedTweetId && mediaMatch?.[2] === quotedTweetId);

    return {
      isArticleUrl,
      isMediaUrl,
      isQuotedTweetMediaUrl,
      isXDomainUrl
    };
  } catch {
    return {
      isArticleUrl: false,
      isMediaUrl: false,
      isQuotedTweetMediaUrl: false,
      isXDomainUrl: false
    };
  }
}

function getUrlDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function formatDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    const displayPath = path && path !== "/" ? path : "";
    return `${host}${displayPath}`.slice(0, 64);
  } catch {
    return url;
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeCandidateUrl(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
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
  } catch {
    return sourceUrl.trim();
  }
}
