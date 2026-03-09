import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { enrichWeb } from "./adapters/web";
import { enrichX } from "./adapters/x";
import { enrichYouTube } from "./adapters/youtube";
import { createContentHash } from "./lib/hash";

export const processCapture = internalAction({
  args: { captureId: v.string() },
  handler: async (ctx, args) => {
    const snapshot = await ctx.runQuery(internal.captures.getCaptureForEnrichment, {
      captureId: args.captureId
    });

    if (!snapshot?.capture) {
      throw new Error(`Capture ${args.captureId} not found`);
    }

    const capture = snapshot.capture;

    await ctx.runMutation(internal.captures.markEnrichmentProcessing, {
      captureId: args.captureId
    });

    try {
      const payload = await selectAdapter({
        sourceUrl: capture.canonicalUrl,
        platform: capture.platform,
        platformIds: capture.platformIds,
        rawPayload: capture.rawPayload
      });

      const contentHash = payload.textContent ? await createContentHash(payload.textContent) : undefined;

      await ctx.runMutation(internal.captures.markEnrichmentSuccess, {
        captureId: args.captureId,
        status: payload.status,
        author: payload.author,
        publishedAt: payload.publishedAt,
        previewImage: payload.previewImage,
        title: payload.title,
        summary: payload.summary,
        textContent: payload.textContent,
        confidence: payload.confidence,
        platformIds: payload.platformIds,
        rawPayload: payload.raw,
        contentHash
      });
    } catch (error) {
      await ctx.runMutation(internal.captures.markEnrichmentFailure, {
        captureId: args.captureId,
        error: error instanceof Error ? error.message : "Unknown enrichment failure",
        payload: {
          platform: capture.platform,
          source_url: capture.sourceUrl
        }
      });
    }
  }
});

async function selectAdapter(input: {
  sourceUrl: string;
  platform: string;
  platformIds?: Record<string, unknown>;
  rawPayload?: Record<string, unknown>;
}) {
  if (input.platform === "x") {
    return await enrichX(input.sourceUrl, input.platformIds, input.rawPayload);
  }

  if (input.platform === "youtube") {
    return await enrichYouTube(input.sourceUrl, input.platformIds);
  }

  return await enrichWeb(input.sourceUrl);
}
