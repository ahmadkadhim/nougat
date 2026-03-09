export function formatLocalDateTime(timestamp?: number | null) {
  if (!timestamp) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

export function ProvenanceBlock({
  approvedAt,
  justification,
  sourceAuthor,
  sourceCaptureCount,
  sourceLabel = "Source",
  sourceUrl
}: {
  approvedAt?: number | null;
  justification?: string | null;
  sourceAuthor?: string | null;
  sourceCaptureCount?: number | null;
  sourceLabel?: string;
  sourceUrl?: string | null;
}) {
  return (
    <div className="derived-meta-block">
      <p className="panel-meta">
        {sourceAuthor ?? "Unknown source"} · {sourceCaptureCount ?? 1} source capture{sourceCaptureCount === 1 ? "" : "s"} · Approved{" "}
        {formatLocalDateTime(approvedAt)}
      </p>
      {sourceUrl ? (
        <a className="inline-link" href={sourceUrl} rel="noreferrer" target="_blank">
          {sourceLabel}
        </a>
      ) : null}
      {justification ? <p className="panel-meta">{justification}</p> : null}
    </div>
  );
}

export function RelatedViewpoints({
  items
}: {
  items?: Array<{
    canonicalUrl: string;
    claim: string;
    confidence: number;
    evidenceQuote?: string;
    rationale?: string;
    sourceAuthor?: string;
    stance: string;
    topic: string;
  }>;
}) {
  if (!items?.length) return null;

  return (
    <div className="derived-related-block">
      <p className="panel-label">Related viewpoints</p>
      <div className="derived-related-list">
        {items.map((item, index) => (
          <article className="derived-related-card" key={`${item.topic}-${item.claim}-${index}`}>
            <div className="stack-row">
              <span className="pill">{item.topic}</span>
              <span className="pill">{item.stance}</span>
            </div>
            <p className="panel-copy">{item.claim}</p>
            {item.rationale ? <p className="panel-meta">{item.rationale}</p> : null}
            {item.evidenceQuote ? <blockquote className="source-quote">{item.evidenceQuote}</blockquote> : null}
            <p className="panel-meta">
              {item.sourceAuthor ?? "Unknown source"} · Confidence {Math.round(item.confidence * 100)}%
            </p>
            <a className="inline-link" href={item.canonicalUrl} rel="noreferrer" target="_blank">
              Open source
            </a>
          </article>
        ))}
      </div>
    </div>
  );
}

export function ViewpointTopicGroups({
  topics
}: {
  topics?: Array<{
    items: Array<{
      canonicalUrl: string;
      claim: string;
      confidence: number;
      evidenceQuote?: string;
      rationale?: string;
      sourceAuthor?: string;
      stance: string;
      updatedAt: number;
    }>;
    stanceCount: number;
    topic: string;
    totalCount: number;
  }>;
}) {
  if (!topics?.length) return null;

  return (
    <section className="panel list-panel">
      <div className="stack-row">
        <div>
          <p className="panel-label">Competing plays</p>
          <h2>Conflicting and overlapping advice</h2>
        </div>
      </div>
      <div className="list-stack">
        {topics.map((topic) => (
          <article className="list-card" key={topic.topic}>
            <div className="stack-row">
              <h2>{topic.topic}</h2>
              <span className="pill">
                {topic.totalCount} viewpoints · {topic.stanceCount} stances
              </span>
            </div>
            <div className="derived-related-list">
              {topic.items.map((item, index) => (
                <article className="derived-related-card" key={`${topic.topic}-${index}`}>
                  <div className="stack-row">
                    <span className="pill">{item.stance}</span>
                    <span className="panel-meta">{formatLocalDateTime(item.updatedAt)}</span>
                  </div>
                  <p className="panel-copy">{item.claim}</p>
                  {item.rationale ? <p className="panel-meta">{item.rationale}</p> : null}
                  {item.evidenceQuote ? <blockquote className="source-quote">{item.evidenceQuote}</blockquote> : null}
                  <p className="panel-meta">
                    {item.sourceAuthor ?? "Unknown source"} · Confidence {Math.round(item.confidence * 100)}%
                  </p>
                  <a className="inline-link" href={item.canonicalUrl} rel="noreferrer" target="_blank">
                    Open source
                  </a>
                </article>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
