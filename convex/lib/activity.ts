type ActivityCaptureLike = {
  author?: string;
  canonicalUrl: string;
  captureMethod: string;
  capturedAt: number;
  createdAt: number;
  platform: string;
  publishedAt?: number;
  previewImage?: string;
  rawPayload?: unknown;
  sourceMetadata?: unknown;
  titleHint?: string;
};

type BookmarkRawPayload = {
  author_profile?: {
    avatar_url?: unknown;
    display_name?: unknown;
    username?: unknown;
    verified?: unknown;
  };
  link_preview?: unknown;
  quoted_tweet?: unknown;
  x?: {
    data?: ActivityTweet;
    includes?: {
      media?: ActivityMedia[];
      tweets?: ActivityTweet[];
      users?: ActivityUser[];
    };
  };
  x_bookmark?: {
    created_at?: unknown;
  };
  x_user?: {
    name?: unknown;
    profile_image_url?: unknown;
    username?: unknown;
    verified?: unknown;
  };
};

type ActivityTweet = {
  article?: {
    cover_media?: string;
  };
  attachments?: {
    media_keys?: string[];
  };
  author_id?: string;
  entities?: {
    urls?: Array<{
      expanded_url?: string;
      unwound_url?: string;
      url?: string;
    }>;
  };
  note_tweet?: {
    text?: string;
  };
  text?: string;
};

type ActivityMedia = {
  media_key?: string;
  preview_image_url?: string;
  type?: string;
  url?: string;
};

type ActivityUser = {
  id?: string;
  name?: string;
  profile_image_url?: string;
  username?: string;
  verified?: boolean;
};

type ActivityLinkPreview = {
  author: string | null;
  domain: string | null;
  previewImage: string | null;
  publishedAt: number | null;
  summary: string | null;
  title: string | null;
  type: "article" | "external";
  url: string | null;
};

type ActivityQuotePreview = {
  author: string | null;
  avatarUrl: string | null;
  linkPreview: ActivityLinkPreview | null;
  postedAt: number | null;
  previewImage: string | null;
  text: string | null;
  url: string | null;
  username: string | null;
};

type ActivityXPostPreview = {
  author: string | null;
  avatarUrl: string | null;
  linkPreview: ActivityLinkPreview | null;
  mediaPreviewUrls: string[];
  quote: ActivityQuotePreview | null;
  text: string | null;
  username: string | null;
  verified: boolean;
};

const X_BOOKMARK_SYNC_METHOD = "x_bookmark_sync";

export function getActivityAuthor(capture: ActivityCaptureLike): string | null {
  if (capture.author) {
    return capture.author;
  }

  const raw = capture.rawPayload as BookmarkRawPayload | undefined;
  const name = readString(raw?.x_user?.name);
  if (name) {
    return name;
  }

  return readString(raw?.x_user?.username);
}

export function getActivityPostedAt(capture: ActivityCaptureLike): number | null {
  if (typeof capture.publishedAt === "number") {
    return capture.publishedAt;
  }

  const raw = capture.rawPayload as BookmarkRawPayload | undefined;
  return parseTimestamp(raw?.x_bookmark?.created_at);
}

export function getActivitySourcedAt(capture: ActivityCaptureLike): number {
  return capture.capturedAt;
}

export function getActivitySyncBatchAt(capture: ActivityCaptureLike): number | null {
  return getBookmarkSyncTimestamp(capture);
}

export function buildActivityPreview(capture: ActivityCaptureLike): {
  title: string;
  xPost: ActivityXPostPreview | null;
} {
  if (capture.platform !== "x") {
    return {
      title: capture.titleHint ?? capture.canonicalUrl,
      xPost: null
    };
  }

  const raw = capture.rawPayload as BookmarkRawPayload | undefined;
  const xPayload = raw?.x;
  const tweet = xPayload?.data;
  const usersById = new Map((xPayload?.includes?.users ?? []).flatMap((user) => (user.id ? [[user.id, user]] : [])));
  const mediaByKey = new Map((xPayload?.includes?.media ?? []).flatMap((media) => (media.media_key ? [[media.media_key, media]] : [])));
  const authorUser = tweet?.author_id ? usersById.get(tweet.author_id) : xPayload?.includes?.users?.[0];
  const author =
    readString(raw?.author_profile?.display_name) ??
    getActivityUserDisplayName(authorUser) ??
    getActivityAuthor(capture);
  const username =
    readString(raw?.author_profile?.username) ??
    getActivityUserUsername(authorUser) ??
    readString(raw?.x_user?.username) ??
    parseUsernameFromCanonicalUrl(capture.canonicalUrl);
  const avatarUrl =
    readString(raw?.author_profile?.avatar_url) ??
    getActivityUserAvatarUrl(authorUser) ??
    readString(raw?.x_user?.profile_image_url);
  const verified = readBoolean(raw?.author_profile?.verified) ?? Boolean(authorUser?.verified || raw?.x_user?.verified);
  const renderedText = tweet ? renderActivityTweetDisplayText(tweet) : null;
  const text = renderedText && !isOnlyShortLinkText(renderedText) ? renderedText : null;
  const linkPreview = coerceLinkPreview(raw?.link_preview);
  const mediaPreviewUrls = linkPreview ? [] : getActivityMediaPreviewUrls(tweet ?? {}, mediaByKey, capture.previewImage);
  const quote = coerceQuotePreview(raw?.quoted_tweet);
  const title =
    linkPreview?.title ??
    capture.titleHint ??
    text ??
    quote?.text ??
    capture.canonicalUrl;

  return {
    title,
    xPost: {
      author,
      avatarUrl,
      linkPreview,
      mediaPreviewUrls,
      quote,
      text,
      username,
      verified
    }
  };
}

export function compareActivityCaptures(a: ActivityCaptureLike, b: ActivityCaptureLike): number {
  const sourcedDiff = getActivitySourcedAt(b) - getActivitySourcedAt(a);
  if (sourcedDiff !== 0) {
    return sourcedDiff;
  }

  const bookmarkSyncA = getBookmarkSyncTimestamp(a);
  const bookmarkSyncB = getBookmarkSyncTimestamp(b);
  if (bookmarkSyncA !== null && bookmarkSyncA === bookmarkSyncB) {
    return a.createdAt - b.createdAt;
  }

  return b.createdAt - a.createdAt;
}

function getBookmarkSyncTimestamp(capture: ActivityCaptureLike): number | null {
  if (capture.captureMethod !== X_BOOKMARK_SYNC_METHOD) {
    return null;
  }

  const metadata = capture.sourceMetadata as { synced_at?: unknown } | undefined;
  return parseTimestamp(metadata?.synced_at);
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function coerceLinkPreview(value: unknown): ActivityLinkPreview | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const type = readString(value.type);
  if (type !== "article" && type !== "external") {
    return null;
  }

  return {
    author: readString(value.author),
    domain: readString(value.domain),
    previewImage: readString(value.preview_image),
    publishedAt: parseTimestamp(value.published_at),
    summary: readString(value.summary),
    title: readString(value.title),
    type,
    url: readString(value.url)
  };
}

function coerceQuotePreview(value: unknown): ActivityQuotePreview | null {
  if (!isPlainObject(value)) {
    return null;
  }

  return {
    author: readString(value.author),
    avatarUrl: readString(value.avatar_url),
    linkPreview: coerceLinkPreview(value.link_preview),
    postedAt: parseTimestamp(value.published_at),
    previewImage: readString(value.preview_image),
    text: readString(value.text),
    url: readString(value.url),
    username: readString(value.username)
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseUsernameFromCanonicalUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/([^/]+)\/status\/\d+/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function getActivityUserDisplayName(user?: ActivityUser): string | undefined {
  return readString(user?.name) ?? readString(user?.username) ?? undefined;
}

function getActivityUserUsername(user?: ActivityUser): string | undefined {
  return readString(user?.username) ?? undefined;
}

function getActivityUserAvatarUrl(user?: ActivityUser): string | undefined {
  return readString(user?.profile_image_url) ?? undefined;
}

function getActivityMediaPreviewUrls(
  tweet: ActivityTweet,
  mediaByKey: Map<string, ActivityMedia>,
  fallbackPreviewImage?: string
): string[] {
  const previews: string[] = [];

  for (const mediaKey of tweet.attachments?.media_keys ?? []) {
    const media = mediaByKey.get(mediaKey);
    const preview = media ? readString(media.url) ?? readString(media.preview_image_url) : null;
    if (preview && !previews.includes(preview)) {
      previews.push(preview);
    }
  }

  const articleCover = readString(tweet.article?.cover_media);
  if (articleCover) {
    const cover = mediaByKey.get(articleCover);
    const preview = cover ? readString(cover.url) ?? readString(cover.preview_image_url) : null;
    if (preview && !previews.includes(preview)) {
      previews.push(preview);
    }
  }

  if (fallbackPreviewImage && !previews.includes(fallbackPreviewImage)) {
    previews.push(fallbackPreviewImage);
  }

  return previews;
}

function renderActivityTweetDisplayText(tweet: ActivityTweet): string | null {
  const rawText = readString(tweet.note_tweet?.text) ?? readString(tweet.text);
  if (!rawText) return null;

  let next = rawText;
  for (const url of tweet.entities?.urls ?? []) {
    const shortUrl = readString(url.url);
    if (!shortUrl) continue;
    const expanded = readString(url.unwound_url) ?? readString(url.expanded_url) ?? shortUrl;
    const replacement = isActivityXUrl(expanded) ? "" : formatActivityDisplayUrl(expanded);
    next = next.split(shortUrl).join(replacement);
  }

  const normalized = next
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized || null;
}

function isActivityXUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host.includes("x.com") || host.includes("twitter.com");
  } catch {
    return false;
  }
}

function formatActivityDisplayUrl(url: string): string {
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

function isOnlyShortLinkText(text?: string | null): boolean {
  if (!text) return false;
  const stripped = text.replace(/\s+/g, " ").trim();
  return /^https:\/\/t\.co\/[A-Za-z0-9]+(?: https:\/\/t\.co\/[A-Za-z0-9]+)*$/.test(stripped);
}
