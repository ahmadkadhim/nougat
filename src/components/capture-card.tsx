import { useEffect, useRef, useState } from "react";

export type DashboardLinkPreview = {
  author: string | null;
  domain: string | null;
  previewImage: string | null;
  publishedAt: number | null;
  summary: string | null;
  title: string | null;
  type: "article" | "external";
  url: string | null;
};

export type DashboardQuotePreview = {
  author: string | null;
  avatarUrl: string | null;
  linkPreview: DashboardLinkPreview | null;
  postedAt: number | null;
  previewImage: string | null;
  text: string | null;
  url: string | null;
  username: string | null;
};

export type DashboardXPost = {
  author: string | null;
  avatarUrl: string | null;
  linkPreview: DashboardLinkPreview | null;
  mediaPreviewUrls: string[];
  quote: DashboardQuotePreview | null;
  text: string | null;
  username: string | null;
  verified: boolean;
};

export type DashboardCapture = {
  author: string | null;
  canonicalUrl: string;
  captureMethod: string;
  id: string;
  platform: string;
  postedAt: number | null;
  sourcedAt: number;
  status: string;
  syncBatchAt?: number | null;
  title: string;
  xPost: DashboardXPost | null;
};

export function formatTimestamp(timestamp?: number | null) {
  if (!timestamp) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestamp);
}

export function formatPostTimestamp(timestamp?: number | null) {
  if (!timestamp) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(timestamp);
}

export function CaptureRow({ capture }: { capture: DashboardCapture }) {
  return (
    <li className={capture.xPost ? "capture-row capture-row-x" : "capture-row"}>
      {capture.xPost ? (
        <article className="x-post-card">
          <div className="x-avatar">
            {capture.xPost.avatarUrl ? (
              <img alt={capture.xPost.author ?? capture.author ?? "X author"} src={capture.xPost.avatarUrl} />
            ) : (
              <span>{getAvatarFallback(capture.xPost.author ?? capture.author ?? capture.title)}</span>
            )}
          </div>

          <div className="x-post-content">
            <div className="x-post-header">
              <div className="x-post-identity">
                <span className="x-post-author">{capture.xPost.author ?? capture.author ?? "Unknown"}</span>
                {capture.xPost.verified ? <span aria-label="Verified account" className="x-post-verified" title="Verified account" /> : null}
                {capture.xPost.username ? <span className="x-post-username">@{capture.xPost.username}</span> : null}
                {capture.postedAt ? (
                  <>
                    <span className="x-post-separator">·</span>
                    <time dateTime={new Date(capture.postedAt).toISOString()}>{formatPostTimestamp(capture.postedAt)}</time>
                  </>
                ) : null}
              </div>

              <a className="x-post-open" href={capture.canonicalUrl} rel="noreferrer" target="_blank">
                Open
              </a>
            </div>

            <div className={capture.xPost.mediaPreviewUrls.length ? "x-post-body has-media" : "x-post-body"}>
              <div className="x-post-main">
                {capture.xPost.text ? <ExpandableText className="x-post-text" text={capture.xPost.text} /> : null}
              </div>
              {capture.xPost.mediaPreviewUrls.length ? (
                <aside className="x-post-media-rail">
                  <MediaCarousel alt={capture.title} href={capture.canonicalUrl} mediaUrls={capture.xPost.mediaPreviewUrls} />
                </aside>
              ) : null}
            </div>
            {capture.xPost.linkPreview ? <LinkPreviewCard preview={capture.xPost.linkPreview} /> : null}
            {capture.xPost.quote ? <QuotePreviewCard quote={capture.xPost.quote} /> : null}

            <div className="x-post-footer">
              <span>{capture.platform.toUpperCase()}</span>
              <span>Saved {formatTimestamp(capture.sourcedAt)}</span>
              <span>{capture.status}</span>
            </div>
          </div>
        </article>
      ) : (
        <>
          <div>
            <p className="capture-title">{capture.title}</p>
            <p className="capture-meta">
              Sourced {formatTimestamp(capture.sourcedAt)} · {capture.author ? `By ${capture.author}` : "Author pending"} ·{" "}
              {capture.postedAt ? `Posted ${formatTimestamp(capture.postedAt)}` : "Posted time pending"}
            </p>
            <p className="capture-submeta">
              {capture.platform} · {capture.captureMethod} · {capture.status}
            </p>
          </div>
          <a href={capture.canonicalUrl} rel="noreferrer" target="_blank">
            Open source
          </a>
        </>
      )}
    </li>
  );
}

function LinkPreviewCard({ preview }: { preview: DashboardLinkPreview }) {
  return (
    <a className="x-link-preview" href={preview.url ?? "#"} rel="noreferrer" target="_blank">
      {preview.previewImage ? (
        <div className="x-link-preview-image">
          <img alt={preview.title ?? preview.domain ?? "Link preview"} src={preview.previewImage} />
        </div>
      ) : null}

      <div className="x-link-preview-body">
        <p className="x-link-preview-domain">
          {preview.type === "article" ? "X Article" : preview.domain ?? "External link"}
          {preview.publishedAt ? ` · ${formatPostTimestamp(preview.publishedAt)}` : ""}
        </p>
        <p className="x-link-preview-title">{preview.title ?? preview.url ?? "Link"}</p>
        {preview.summary ? <p className="x-link-preview-summary">{preview.summary}</p> : null}
        {preview.author ? <p className="x-link-preview-meta">By {preview.author}</p> : null}
      </div>
    </a>
  );
}

function QuotePreviewCard({ quote }: { quote: DashboardQuotePreview }) {
  return (
    <div className="x-quote-card">
      <div className="x-quote-header">
        <div className="x-quote-avatar">
          {quote.avatarUrl ? (
            <img alt={quote.author ?? quote.username ?? "Quoted author"} src={quote.avatarUrl} />
          ) : (
            <span>{getAvatarFallback(quote.author ?? quote.username ?? "Q")}</span>
          )}
        </div>
        <div className="x-quote-identity">
          <span className="x-post-author">{quote.author ?? "Quoted post"}</span>
          {quote.username ? <span className="x-post-username">@{quote.username}</span> : null}
          {quote.postedAt ? (
            <>
              <span className="x-post-separator">·</span>
              <time dateTime={new Date(quote.postedAt).toISOString()}>{formatPostTimestamp(quote.postedAt)}</time>
            </>
          ) : null}
        </div>
        {quote.url ? (
          <a className="x-post-open" href={quote.url} rel="noreferrer" target="_blank">
            Open
          </a>
        ) : null}
      </div>

      {quote.text ? <ExpandableText className="x-quote-text" text={quote.text} /> : null}
      {quote.previewImage ? (
        <div className="x-quote-media">
          <img alt={quote.author ?? "Quoted preview"} src={quote.previewImage} />
        </div>
      ) : null}
      {quote.linkPreview ? <LinkPreviewCard preview={quote.linkPreview} /> : null}
    </div>
  );
}

function ExpandableText({ className, text }: { className: string; text: string }) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    if (expanded) {
      return;
    }

    const node = ref.current;
    if (!node) {
      return;
    }

    const measure = () => {
      setCanExpand(node.scrollHeight > node.clientHeight + 2);
    };

    const frame = window.requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener("resize", measure);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [expanded, text]);

  return (
    <div className="x-text-block">
      <p className={expanded ? className : `${className} is-clamped`} ref={ref}>
        {text}
      </p>
      {canExpand ? (
        <button className="x-text-toggle" onClick={() => setExpanded((value) => !value)} type="button">
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}

function MediaCarousel({
  alt,
  href,
  mediaUrls
}: {
  alt: string;
  href: string;
  mediaUrls: string[];
}) {
  return (
    <div className={mediaUrls.length === 1 ? "x-media-carousel is-single" : "x-media-carousel"}>
      {mediaUrls.map((mediaUrl, index) => (
        <a className="x-media-card" href={href} key={`${mediaUrl}-${index}`} rel="noreferrer" target="_blank">
          <img alt={mediaUrls.length > 1 ? `${alt} ${index + 1}` : alt} src={mediaUrl} />
        </a>
      ))}
    </div>
  );
}

function getAvatarFallback(value: string): string {
  const trimmed = value.trim();
  return trimmed.slice(0, 1).toUpperCase() || "S";
}
