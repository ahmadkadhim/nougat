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

export function summarizeBookmarkText(text?: string, maxLength = 140): string | undefined {
  if (!text) return undefined;
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}
