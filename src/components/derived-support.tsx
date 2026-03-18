export function formatLocalDateTime(timestamp?: number | null) {
  if (!timestamp) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

export function ProvenanceBlock({
  approvedAt,
  sourceAuthor,
  sourceCaptureCount,
  sourceLabel = "Source",
  sourceUrl,
  why
}: {
  approvedAt?: number | null;
  sourceAuthor?: string | null;
  sourceCaptureCount?: number | null;
  sourceLabel?: string;
  sourceUrl?: string | null;
  why?: string | null;
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
      {why ? <p className="panel-meta">{why}</p> : null}
    </div>
  );
}
