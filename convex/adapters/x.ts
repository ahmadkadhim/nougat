import type { EnrichmentPayload } from "../lib/types";
import {
  extractQuotedAuthorUsernameFromUrls,
  getArticlePlainText,
  getPrimaryMediaPreviewUrl,
  getReferencedQuoteTweetId,
  getTweetArticleUrls,
  getUserAvatarUrl,
  getUserDisplayName,
  getUserUsername,
  isOnlyShortLinkText,
  renderTweetDisplayText,
  resolveTweetUrls,
  type XMedia,
  type XContentTweet,
  type XContentUser
} from "../lib/xContent";
import { enrichWeb } from "./web";

type XApiPayload = {
  data?: XContentTweet & { created_at?: string };
  includes?: {
    media?: XMedia[];
    users?: XContentUser[];
    tweets?: Array<XContentTweet & { created_at?: string }>;
    polls?: Array<Record<string, unknown>>;
    places?: Array<Record<string, unknown>>;
  };
  meta?: Record<string, unknown>;
};

export async function enrichX(
  url: string,
  platformIds?: Record<string, unknown>,
  rawPayload?: Record<string, unknown>
): Promise<EnrichmentPayload> {
  const tweetId = (platformIds?.tweet_id as string | undefined) ?? extractTweetId(url);
  if (!tweetId) {
    return {
      status: "partial",
      confidence: 0.3,
      summary: "Unable to parse X post ID from URL."
    };
  }

  const bookmarkPayload = readBookmarkPayload(rawPayload);
  if (bookmarkPayload?.data) {
    return await buildEnrichmentFromPayload(tweetId, bookmarkPayload, "bookmarks");
  }

  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    return {
      status: "partial",
      confidence: 0.35,
      summary: "X_BEARER_TOKEN not configured. Saved URL with minimal metadata.",
      platformIds: { tweet_id: tweetId }
    };
  }

  const payload = await fetchTweetPayload(tweetId, token);
  return await buildEnrichmentFromPayload(tweetId, payload, "tweet_lookup");
}

async function buildEnrichmentFromPayload(
  tweetId: string,
  payload: XApiPayload,
  payloadSource: "bookmarks" | "tweet_lookup"
): Promise<EnrichmentPayload> {
  const tweet = payload?.data ?? {};
  const usersById = new Map((payload.includes?.users ?? []).flatMap((user) => (user.id ? [[user.id, user]] : [])));
  const mediaByKey = new Map((payload.includes?.media ?? []).flatMap((media) => (media.media_key ? [[media.media_key, media]] : [])));
  const user = tweet.author_id ? usersById.get(tweet.author_id) : payload?.includes?.users?.[0];
  const includedTweets = payload.includes?.tweets ?? [];
  const article = tweet.article;
  const text = renderTweetDisplayText(tweet);
  const articlePlainText = getArticlePlainText(tweet);

  const quotedTweetId = getReferencedQuoteTweetId(tweet);
  const quotedTweet = quotedTweetId ? includedTweets.find((item) => item.id === quotedTweetId) : undefined;
  const quotedUser = quotedTweet?.author_id ? usersById.get(quotedTweet.author_id) : undefined;
  const quotedAuthor =
    (quotedTweet?.author_id ? getUserDisplayName(quotedUser) : undefined) ??
    extractQuotedAuthorUsernameFromUrls(tweet, quotedTweetId);
  const quotedUsername =
    (quotedTweet?.author_id ? getUserUsername(quotedUser) : undefined) ??
    extractQuotedAuthorUsernameFromUrls(tweet, quotedTweetId);
  const quotedText = quotedTweet
    ? renderTweetDisplayText(quotedTweet) ?? getArticlePlainText(quotedTweet)
    : undefined;
  const quotedArticlePlainText = quotedTweet ? getArticlePlainText(quotedTweet) : undefined;
  const quotedMediaPreview = quotedTweet ? getPrimaryMediaPreviewUrl(quotedTweet, mediaByKey) : undefined;

  const resolvedUrls = resolveTweetUrls(tweet, quotedTweetId);
  const quotedResolvedUrls = quotedTweet ? resolveTweetUrls(quotedTweet) : [];
  const externalUrls = [
    ...new Set(
      [...resolvedUrls, ...quotedResolvedUrls]
        .filter((item) => !item.isXDomainUrl)
        .map((item) => item.resolvedUrl)
    )
  ].slice(0, 3);
  const externalLinkResults = await Promise.allSettled(externalUrls.map((externalUrl) => enrichWeb(externalUrl)));
  const externalLinks = externalLinkResults.map((result, index) => {
    const externalUrl = externalUrls[index];
    if (result?.status === "fulfilled") {
      return {
        url: externalUrl,
        title: result.value.title ?? null,
        author: result.value.author ?? null,
        published_at: result.value.publishedAt ?? null,
        preview_image: result.value.previewImage ?? null,
        summary: result.value.summary ?? null,
        text_content: truncate(result.value.textContent, 4_000) ?? null,
        raw: result.value.raw ?? null
      };
    }

    return {
      url: externalUrl,
      error: result.reason instanceof Error ? result.reason.message : "Unknown external link enrichment failure"
    };
  });

  const author = getUserDisplayName(user);
  const username = getUserUsername(user);
  const avatarUrl = getUserAvatarUrl(user);
  const publishedAt = typeof tweet?.created_at === "string" ? Date.parse(tweet.created_at) : NaN;
  const articlePreviewImage = getPrimaryMediaPreviewUrl(tweet, mediaByKey);
  const mainExternalLink = externalLinks.find((link) => "title" in link && link.title) ?? externalLinks.find((link) => "title" in link);
  const title =
    article?.title ||
    truncate(text, 100) ||
    ("title" in (mainExternalLink ?? {}) ? mainExternalLink?.title : undefined) ||
    `X post ${tweetId}`;
  const summary = [
    truncate(text, 280),
    articlePlainText ? `Article attached (${articlePlainText.length} chars).` : null,
    quotedText || quotedArticlePlainText
      ? `Quoted ${formatQuotedAuthor(quotedAuthor)}: ${truncate(quotedText ?? quotedArticlePlainText, 180)}`
      : null,
    externalLinks.length ? `Links: ${externalLinks.map((link) => ("title" in link && link.title ? link.title : link.url)).join(" · ")}` : null
  ]
    .filter(Boolean)
    .join(" ");

  const textSections = [
    shouldShowMainText(text) ? text : null,
    articlePlainText ? `Attached article\n${truncate(articlePlainText, 12_000)}` : null,
    quotedText || quotedArticlePlainText
      ? `Quoted post${quotedAuthor ? ` by ${formatQuotedAuthor(quotedAuthor)}` : ""}\n${truncate(
          quotedText ?? quotedArticlePlainText,
          4_000
        )}`
      : null,
    ...externalLinks
      .filter((item): item is Extract<typeof item, { text_content: string | null }> => "text_content" in item)
      .map((item) => formatExternalLinkSection(item))
  ].filter(Boolean) as string[];

  const previewImage =
    articlePreviewImage ??
    getPrimaryMediaPreviewUrl(tweet, mediaByKey) ??
    externalLinks.find((link) => "preview_image" in link && link.preview_image)?.preview_image ??
    undefined;
  const textContent = textSections.join("\n\n");
  const quoteLinkPreview =
    buildLinkPreviewFromArticle(quotedTweet, quotedArticlePlainText, quotedMediaPreview) ??
    buildLinkPreviewFromExternalLinks(externalLinks, quotedResolvedUrls.map((item) => item.resolvedUrl));
  const linkPreview =
    buildLinkPreviewFromArticle(tweet, articlePlainText, articlePreviewImage) ??
    buildLinkPreviewFromExternalLinks(externalLinks, resolvedUrls.map((item) => item.resolvedUrl));

  return {
    title,
    author,
    publishedAt: Number.isNaN(publishedAt) ? undefined : publishedAt,
    previewImage,
    summary: summary || undefined,
    textContent: textContent || undefined,
    platformIds: {
      tweet_id: tweetId,
      author_id: tweet?.author_id,
      article_id: article?.id,
      quoted_tweet_id: quotedTweetId
    },
    confidence: textContent ? 0.9 : 0.6,
    status: textContent ? "enriched" : "partial",
    raw: {
      x_enrichment_context: buildEnrichmentContext(tweetId, payload, payloadSource),
      x: payload,
      resolved_urls: resolvedUrls,
      external_links: externalLinks,
      link_preview: linkPreview,
      author_profile: {
        avatar_url: avatarUrl ?? null,
        display_name: author ?? null,
        username: username ?? null,
        verified: user?.verified ?? null
      },
      quoted_tweet: quotedTweet
        ? {
            avatar_url: getUserAvatarUrl(quotedUser) ?? null,
            id: quotedTweet.id ?? null,
            author: quotedAuthor ?? null,
            username: quotedUsername ?? null,
            url: buildQuotedTweetUrl(quotedTweet, quotedUsername),
            published_at: parsePublishedAt(quotedTweet.created_at),
            preview_image: quotedMediaPreview ?? null,
            link_preview: quoteLinkPreview,
            text: quotedText ?? quotedArticlePlainText ?? null
          }
        : null
    }
  };
}

async function fetchTweetPayload(tweetId: string, token: string): Promise<XApiPayload> {
  const endpoint = new URL(`https://api.x.com/2/tweets/${tweetId}`);
  endpoint.searchParams.set(
    "expansions",
    [
      "author_id",
      "attachments.media_keys",
      "referenced_tweets.id",
      "referenced_tweets.id.attachments.media_keys",
      "referenced_tweets.id.author_id"
    ].join(",")
  );
  endpoint.searchParams.set(
    "tweet.fields",
    "attachments,created_at,entities,lang,public_metrics,article,note_tweet,referenced_tweets,suggested_source_links,text"
  );
  endpoint.searchParams.set("user.fields", "name,profile_image_url,username,verified");
  endpoint.searchParams.set("media.fields", "alt_text,media_key,preview_image_url,type,url");

  const res = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`X API request failed (${res.status})`);
  }

  return (await res.json()) as XApiPayload;
}

function readBookmarkPayload(rawPayload?: Record<string, unknown>): XApiPayload | undefined {
  const response = (rawPayload?.x_bookmark_context as { response?: XApiPayload } | undefined)?.response;
  return response?.data ? response : undefined;
}

function buildEnrichmentContext(tweetId: string, payload: XApiPayload, payloadSource: "bookmarks" | "tweet_lookup") {
  return {
    fetched_at: Date.now(),
    source: payloadSource,
    request:
      payloadSource === "bookmarks"
        ? {
            endpoint: "/2/users/:id/bookmarks",
            reused_bookmark_payload: true
          }
        : {
            endpoint: `/2/tweets/${tweetId}`,
            expansions: [
              "author_id",
              "attachments.media_keys",
              "referenced_tweets.id",
              "referenced_tweets.id.attachments.media_keys",
              "referenced_tweets.id.author_id"
            ],
            tweet_fields: [
              "attachments",
              "created_at",
              "entities",
              "lang",
              "public_metrics",
              "article",
              "note_tweet",
              "referenced_tweets",
              "suggested_source_links",
              "text"
            ],
            user_fields: ["name", "profile_image_url", "username", "verified"],
            media_fields: ["alt_text", "media_key", "preview_image_url", "type", "url"]
          },
    response: payload
  };
}

function extractTweetId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/status\/(\d+)/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatQuotedAuthor(author?: string): string {
  if (!author) return "tweet";
  if (author.startsWith("@")) return author;
  if (/\s/.test(author)) return author;
  return `@${author}`;
}

function formatExternalLinkSection(link: {
  url: string;
  title?: string | null;
  author?: string | null;
  published_at?: number | null;
  text_content?: string | null;
}): string {
  const lines = [`External link: ${link.title ?? link.url}`, link.url];
  if (link.author) {
    lines.push(`Author: ${link.author}`);
  }
  if (link.published_at) {
    lines.push(`Published: ${new Date(link.published_at).toISOString()}`);
  }
  if (link.text_content) {
    lines.push(link.text_content);
  }
  return lines.join("\n");
}

function buildLinkPreviewFromArticle(
  tweet: XContentTweet | undefined,
  articlePlainText: string | undefined,
  articlePreviewImage: string | undefined
) {
  if (!tweet?.article) {
    return null;
  }

  const articleUrl = readString(tweet.article.url);
  const fallbackArticleUrl = getTweetArticleUrls(tweet)[0];

  return {
    type: "article",
    url: articleUrl ?? fallbackArticleUrl ?? null,
    title: readString(tweet.article.title) ?? null,
    summary: readString(tweet.article.preview_text) ?? truncate(articlePlainText, 180) ?? null,
    preview_image: articlePreviewImage ?? null,
    domain: articleUrl ? extractDomain(articleUrl) : null
  };
}

function buildLinkPreviewFromExternalLinks(
  externalLinks: Array<
    | {
        author: string | null;
        preview_image: string | null;
        published_at: number | null;
        raw: unknown;
        summary: string | null;
        text_content: string | null;
        title: string | null;
        url: string;
      }
    | {
        error: string;
        url: string;
      }
  >,
  candidateUrls: string[]
) {
  for (const url of candidateUrls) {
    const match = externalLinks.find((item) => item.url === url && "title" in item);
    if (!match || !("title" in match)) continue;

    return {
      type: "external",
      url: match.url,
      title: match.title ?? null,
      summary: match.summary ?? truncate(match.text_content ?? undefined, 180) ?? null,
      preview_image: match.preview_image ?? null,
      domain: extractDomain(match.url),
      author: match.author ?? null,
      published_at: match.published_at ?? null
    };
  }

  return null;
}

function buildQuotedTweetUrl(tweet: XContentTweet, username?: string): string | null {
  if (!tweet.id) return null;
  if (username) {
    return `https://x.com/${username}/status/${tweet.id}`;
  }

  return `https://x.com/i/web/status/${tweet.id}`;
}

function shouldShowMainText(text?: string): boolean {
  if (!text) return false;
  return !isOnlyShortLinkText(text);
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function parsePublishedAt(value?: string): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
