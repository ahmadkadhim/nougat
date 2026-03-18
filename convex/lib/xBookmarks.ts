export interface XBookmarkUser {
  id: string;
  name?: string;
  profile_image_url?: string;
  username?: string;
  verified?: boolean;
}

export interface XBookmarkTweet {
  id: string;
  author_id?: string;
  created_at?: string;
  text?: string;
}

export const BOOKMARK_PAGE_SIZE = 10;
const MIN_BOOKMARK_PAGE_SIZE = 1;
const MAX_BOOKMARK_PAGE_SIZE = 100;
const DEFAULT_BOOKMARK_SCAN_BUDGET = 800;
const MAX_BOOKMARK_PAGE_REQUESTS = 100;

export function buildXStatusUrl(tweet: XBookmarkTweet, usersById: Map<string, XBookmarkUser>): string {
  const username = tweet.author_id ? usersById.get(tweet.author_id)?.username : undefined;
  if (username) {
    return `https://x.com/${username}/status/${tweet.id}`;
  }

  return `https://x.com/i/web/status/${tweet.id}`;
}

export function collectNewBookmarks<T extends { id: string }>(
  items: T[],
  lastSeenTweetId?: string
): { items: T[]; reachedLastSeen: boolean } {
  if (!lastSeenTweetId) {
    return { items, reachedLastSeen: false };
  }

  const nextItems: T[] = [];
  for (const item of items) {
    if (item.id === lastSeenTweetId) {
      return { items: nextItems, reachedLastSeen: true };
    }
    nextItems.push(item);
  }

  return { items: nextItems, reachedLastSeen: false };
}

export function getBookmarkCaptureTimestamp(syncStartedAt: number, bookmarkOffset: number): number {
  return syncStartedAt - bookmarkOffset;
}

export function resolveBookmarkPageRequestLimit(pageSize: number): number {
  const safePageSize = clampNumber(pageSize, MIN_BOOKMARK_PAGE_SIZE, MAX_BOOKMARK_PAGE_SIZE);
  return Math.max(1, Math.min(MAX_BOOKMARK_PAGE_REQUESTS, Math.ceil(DEFAULT_BOOKMARK_SCAN_BUDGET / safePageSize)));
}

export function summarizeBookmarkText(text?: string, maxLength = 140): string | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
