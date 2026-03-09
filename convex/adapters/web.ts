import type { EnrichmentPayload } from "../lib/types";

const UA = "NougatBot/1.0 (+https://example.local/nougat)";

type WebMetadata = {
  title?: string;
  description?: string;
  author?: string;
  publishedAt?: number;
  previewImage?: string;
  canonicalUrl?: string;
  siteName?: string;
};

export async function enrichWeb(url: string): Promise<EnrichmentPayload> {
  const response = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status})`);
  }

  const html = await response.text();
  const metadata = extractWebMetadata(html, response.url);
  const body = extractArticleText(html);
  const summary = metadata.description ?? (body ? summarize(body) : undefined);

  return {
    title: metadata.title,
    author: metadata.author,
    publishedAt: metadata.publishedAt,
    previewImage: metadata.previewImage,
    textContent: body,
    summary,
    confidence: body && body.length > 280 ? 0.84 : metadata.title || metadata.description ? 0.68 : 0.58,
    status: body && body.length > 80 ? "enriched" : metadata.title || metadata.description ? "partial" : "partial",
    raw: {
      web: {
        fetched_url: response.url,
        content_type: response.headers.get("content-type"),
        metadata
      }
    }
  };
}

export function extractWebMetadata(html: string, fetchedUrl?: string): WebMetadata {
  const title =
    extractFirstMetaContent(html, ["og:title", "twitter:title"]) ??
    extractTitleTag(html) ??
    undefined;
  const description = extractFirstMetaContent(html, ["description", "og:description", "twitter:description"]) ?? undefined;
  const author = extractFirstMetaContent(html, ["author", "article:author", "og:author"]) ?? undefined;
  const publishedAt = parseTimestamp(
    extractFirstMetaContent(html, [
      "article:published_time",
      "og:published_time",
      "parsely-pub-date",
      "pubdate",
      "date",
      "dc.date",
      "dc.date.issued"
    ]) ?? undefined
  );
  const previewImage = extractFirstMetaContent(html, ["og:image", "twitter:image", "twitter:image:src"]) ?? undefined;
  const canonicalUrl = extractCanonicalUrl(html) ?? extractFirstMetaContent(html, ["og:url"]) ?? fetchedUrl ?? undefined;
  const siteName = extractFirstMetaContent(html, ["og:site_name", "application-name"]) ?? undefined;

  return {
    title,
    description,
    author,
    publishedAt,
    previewImage,
    canonicalUrl,
    siteName
  };
}

function extractTitleTag(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return undefined;
  return decodeHtml(match[1]).trim().replace(/\s+/g, " ") || undefined;
}

function extractFirstMetaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    const regex = new RegExp(
      `<meta[^>]+(?:name|property)=["']${escapeRegExp(name)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i"
    );
    const match = html.match(regex);
    if (match?.[1]) {
      return decodeHtml(match[1]).trim();
    }

    const reversedRegex = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escapeRegExp(name)}["'][^>]*>`,
      "i"
    );
    const reversedMatch = html.match(reversedRegex);
    if (reversedMatch?.[1]) {
      return decodeHtml(reversedMatch[1]).trim();
    }
  }

  return null;
}

function extractCanonicalUrl(html: string): string | null {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i);
  if (match?.[1]) {
    return decodeHtml(match[1]).trim();
  }

  const reversedMatch = html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["'][^>]*>/i);
  if (reversedMatch?.[1]) {
    return decodeHtml(reversedMatch[1]).trim();
  }

  return null;
}

function extractArticleText(html: string): string | undefined {
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const source = articleMatch ? articleMatch[1] : html;

  const stripped = source
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const decoded = decodeHtml(stripped);
  if (!decoded) return undefined;
  return decoded.slice(0, 12_000);
}

function summarize(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 280) return trimmed;
  return `${trimmed.slice(0, 277).trim()}...`;
}

function parseTimestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}
