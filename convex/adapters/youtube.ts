import type { EnrichmentPayload } from "../lib/types";

export async function enrichYouTube(url: string, platformIds?: Record<string, unknown>): Promise<EnrichmentPayload> {
  const videoId = (platformIds?.video_id as string | undefined) ?? extractVideoId(url);
  if (!videoId) {
    return {
      confidence: 0.2,
      status: "partial",
      summary: "Unable to extract YouTube video ID."
    };
  }

  const oembed = await fetchOembed(url);
  const transcript = await fetchTranscript(videoId);

  const summaryParts = [
    oembed?.title ? `Video: ${oembed.title}` : null,
    oembed?.author_name ? `Creator: ${oembed.author_name}` : null,
    transcript ? `Transcript captured (${Math.min(transcript.length, 1_200)} chars).` : "Transcript unavailable."
  ].filter(Boolean) as string[];

  return {
    title: oembed?.title,
    author: oembed?.author_name,
    textContent: transcript ?? undefined,
    summary: summaryParts.join(" "),
    platformIds: { video_id: videoId },
    confidence: transcript ? 0.88 : 0.62,
    status: transcript ? "enriched" : "partial",
    raw: {
      oembed
    }
  };
}

function extractVideoId(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.slice(1) || undefined;
    }

    return parsed.searchParams.get("v") ?? undefined;
  } catch {
    return undefined;
  }
}

async function fetchOembed(url: string): Promise<{ title?: string; author_name?: string } | null> {
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`;
  const res = await fetch(endpoint);
  if (!res.ok) return null;
  return (await res.json()) as { title?: string; author_name?: string };
}

async function fetchTranscript(videoId: string): Promise<string | null> {
  const endpoint = `https://www.youtube.com/api/timedtext?lang=en&v=${encodeURIComponent(videoId)}`;
  const res = await fetch(endpoint);
  if (!res.ok) return null;

  const xml = await res.text();
  const matches = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];
  if (matches.length === 0) return null;

  const transcript = matches
    .map((match) => decodeHtml(match[1]))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return transcript || null;
}

function decodeHtml(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
