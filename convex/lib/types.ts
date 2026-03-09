export const EXTRACTION_STATUSES = [
  "queued",
  "processing",
  "enriched",
  "partial",
  "failed",
  "dead_letter"
] as const;

export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export interface CaptureRequest {
  source_url: string;
  captured_at: number;
  capture_method:
    | "single_tab"
    | "selected_tabs"
    | "window_tabs"
    | "all_tabs"
    | "share_sheet"
    | "manual"
    | "x_bookmark_sync";
  source_app: string;
  author_hint?: string;
  title_hint?: string;
  selected_text?: string;
  tab_context?: string;
  platform_hint?: string;
  source_metadata?: Record<string, unknown>;
  idempotency_key?: string;
}

export interface CaptureRecord {
  capture_id: string;
  source_url: string;
  canonical_url: string;
  author?: string;
  published_at?: number;
  preview_image?: string;
  platform: string;
  platform_ids?: Record<string, unknown>;
  captured_at: number;
  device_id: string;
  capture_method: string;
  source_app: string;
  extraction_status: ExtractionStatus;
  confidence?: number;
  title_hint?: string;
  selected_text?: string;
  tab_context?: string;
  source_metadata?: Record<string, unknown>;
  capture_hash: string;
  content_hash?: string;
  created_at: number;
  updated_at: number;
}

export interface EnrichmentJob {
  job_id: string;
  capture_id: string;
  status: "queued" | "processing" | "completed" | "failed" | "dead_letter";
  attempt: number;
  max_attempts: number;
  scheduled_at: number;
  started_at?: number;
  finished_at?: number;
  last_error?: string;
}

export interface MarkdownDocument {
  document_id: string;
  capture_id: string;
  path: string;
  markdown: string;
  frontmatter: Record<string, unknown>;
  export_status: "pending" | "exported";
  created_at: number;
  updated_at: number;
  exported_at?: number;
}

export interface EnrichmentPayload {
  title?: string;
  author?: string;
  publishedAt?: number;
  previewImage?: string;
  textContent?: string;
  summary?: string;
  platformIds?: Record<string, unknown>;
  raw?: Record<string, unknown>;
  confidence: number;
  status: "enriched" | "partial";
}
