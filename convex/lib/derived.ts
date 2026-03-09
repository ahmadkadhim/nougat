type CaptureLike = {
  author?: string;
  canonicalUrl: string;
  captureId: string;
  ownerAuthUserId?: string;
  platform: string;
  platformIds?: Record<string, unknown>;
  rawPayload?: unknown;
  titleHint?: string;
};

type MarkdownLike = {
  markdown?: string;
};

export type DerivedTagSuggestion = {
  confidence: number;
  justification: string;
  name: string;
  role: "primary" | "secondary";
  slug: string;
};

export type DerivedKnowledgeSuggestion = {
  confidence: number;
  content: string;
  justification: string;
  sourceQuote?: string;
  title: string;
};

export type DerivedTaskSuggestion = {
  assigneeType: "user" | "agent";
  confidence: number;
  details: string;
  executionTarget?: string;
  justification: string;
  suggestedAction?: string;
  title: string;
};

export type DerivedSkillSuggestion = {
  confidence: number;
  details: string;
  justification: string;
  proposedChange: string;
  targetSystem: string;
  title: string;
};

export type DerivedResourceSuggestion = {
  company?: string;
  confidence: number;
  creator?: string;
  details: string;
  justification: string;
  name: string;
  resourceType: string;
  resourceUrl: string;
  useCases: string[];
};

export type DerivedAuthorRating = {
  confidence: number;
  hypeScore: number;
  justification: string;
  relevanceScore: number;
  signalScore: number;
  suggestedTier: string;
  trustScore: number;
};

export type DerivedViewpoint = {
  claim: string;
  confidence: number;
  conflictKey: string;
  evidenceQuote?: string;
  justification: string;
  rationale?: string;
  stance: "do" | "avoid" | "caution" | "tradeoff";
  topic: string;
};

export type DerivedEvaluationBundle = {
  authorRating: DerivedAuthorRating;
  knowledgeItems: DerivedKnowledgeSuggestion[];
  resources: DerivedResourceSuggestion[];
  skillCandidates: DerivedSkillSuggestion[];
  tags: DerivedTagSuggestion[];
  tasks: DerivedTaskSuggestion[];
  viewpoints: DerivedViewpoint[];
};

const TAG_RULES: Array<{ keywords: string[]; name: string; slug: string }> = [
  { name: "Cold Outreach", slug: "cold-outreach", keywords: ["cold email", "cold outreach", "outbound", "prospect", "lead list"] },
  { name: "Agent Memory", slug: "agent-memory", keywords: ["memory", "rag", "retrieval", "context window", "vector", "embedding"] },
  { name: "Agent Setup", slug: "agent-setup", keywords: ["agent", "openclaw", "claude", "prompt", "tool", "workflow", "skill"] },
  { name: "Browser Automation", slug: "browser-automation", keywords: ["browser", "playwright", "tab", "scrape", "automation"] },
  { name: "Marketing", slug: "marketing", keywords: ["marketing", "growth", "positioning", "campaign", "viral", "lead magnet"] },
  { name: "Writing", slug: "writing", keywords: ["writing", "copy", "headline", "story", "email"] },
  { name: "Design", slug: "design", keywords: ["design", "font", "animation", "visual", "ui", "layout"] },
  { name: "Operations", slug: "operations", keywords: ["process", "ops", "system", "checklist", "audit"] }
];

const HYPE_TERMS = [
  "game changer",
  "changes everything",
  "most viral",
  "insane",
  "crazy",
  "electric",
  "destroy",
  "blow your mind",
  "must use",
  "secret"
];

const TRUST_TERMS = ["proof", "logs", "tested", "verified", "specific", "example", "results", "walkthrough"];
const ACTION_VERBS = ["turn on", "connect", "set up", "add", "change", "use", "install", "try", "review", "read", "write", "sync"];
const RESOURCE_HINT_TERMS = ["tool", "app", "plugin", "template", "prompt", "repo", "repository", "github", "figma", "resource"];

export function buildDerivedEvaluation(input: {
  capture: CaptureLike;
  document?: MarkdownLike | null;
  existingTagNames?: string[];
}): DerivedEvaluationBundle {
  const text = extractDocumentBody(input.document?.markdown) ?? input.capture.titleHint ?? input.capture.canonicalUrl;
  const title = extractDocumentTitle(input.document?.markdown) ?? input.capture.titleHint ?? "Untitled capture";
  const topicTags = deriveTags(text, input.existingTagNames ?? []);
  const primaryTag = topicTags.find((item) => item.role === "primary") ?? topicTags[0] ?? {
    name: "General",
    slug: "general",
    role: "primary" as const,
    confidence: 0.45,
    justification: "Fallback tag because no stronger topical signal was found."
  };
  const quote = pickSourceQuote(text);
  const resources = deriveResources(input.capture, text, title);
  const resourceOnly = isResourceOnlyCapture(input.capture, text, resources);

  return {
    tags: topicTags,
    knowledgeItems: resourceOnly ? [] : [deriveKnowledgeItem(title, text, quote)],
    resources,
    tasks: resourceOnly ? [] : deriveTasks(text, primaryTag.slug),
    skillCandidates: resourceOnly ? [] : deriveSkills(text, primaryTag.slug, quote),
    authorRating: deriveAuthorRating(text),
    viewpoints: resourceOnly ? [] : deriveViewpoints(text, primaryTag.slug, quote)
  };
}

export function slugifyTag(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function normalizeTaskKey(input: {
  assigneeType: "user" | "agent";
  tagSlug?: string;
  title: string;
}): string {
  return slugifyTag(`${input.assigneeType}-${input.tagSlug ?? "general"}-${input.title}`);
}

export function normalizeSkillKey(input: {
  tagSlug?: string;
  targetSystem: string;
  title: string;
}): string {
  return slugifyTag(`${input.targetSystem}-${input.tagSlug ?? "general"}-${input.title}`);
}

export function topicConflictKey(topic: string, claim: string): string {
  return slugifyTag(`${topic}-${claim.split(/[.?!]/)[0] ?? claim}`.slice(0, 120));
}

export function normalizeResourceKey(input: { resourceUrl: string }): string {
  return slugifyTag(input.resourceUrl);
}

function deriveTags(text: string, existingTagNames: string[]): DerivedTagSuggestion[] {
  const lowered = text.toLowerCase();
  const matches = TAG_RULES
    .map((rule) => ({
      ...rule,
      score: rule.keywords.reduce((count, keyword) => count + (lowered.includes(keyword) ? 1 : 0), 0)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = matches.slice(0, 4).map((item, index) => {
    const preferredName = findExistingTagName(item.name, existingTagNames) ?? item.name;
    return {
      name: preferredName,
      slug: slugifyTag(preferredName),
      role: index === 0 ? ("primary" as const) : ("secondary" as const),
      confidence: clamp(0.55 + item.score * 0.08, 0.55, 0.92),
      justification: `Matched source language to ${item.name.toLowerCase()} keywords: ${item.keywords.filter((keyword) =>
        lowered.includes(keyword)
      ).join(", ")}.`
    };
  });

  if (selected.length > 0) {
    return selected;
  }

  const fallbackName = findExistingTagName("General", existingTagNames) ?? "General";
  return [
    {
      name: fallbackName,
      slug: slugifyTag(fallbackName),
      role: "primary",
      confidence: 0.45,
      justification: "Fallback tag because no rule-based topic was a clear match."
    }
  ];
}

function deriveKnowledgeItem(title: string, text: string, quote?: string): DerivedKnowledgeSuggestion {
  const sentences = extractSentences(text);
  const compact = sentences.slice(0, 3).join(" ").trim();
  const content = quote
    ? `${compact}\n\nKeep the source texture here:\n> ${quote}`
    : compact;

  return {
    title: truncate(title, 120) ?? "Untitled knowledge item",
    content: truncate(content, 1_200) ?? title,
    sourceQuote: quote,
    confidence: quote ? 0.82 : 0.7,
    justification: quote
      ? "Preserved a vivid source quote instead of sanding it down into generic advice."
      : "Condensed the source into a concise note while keeping original phrasing where possible."
  };
}

function deriveTasks(text: string, tagSlug: string): DerivedTaskSuggestion[] {
  const sentences = extractSentences(text);
  const candidates: DerivedTaskSuggestion[] = [];

  for (const sentence of sentences) {
    const lowered = sentence.toLowerCase();
    const verb = ACTION_VERBS.find((item) => lowered.includes(item));
    if (!verb) continue;

    const assigneeType =
      /(agent|openclaw|claude|skill|prompt|tool|workflow|hybrid search|temporal decay|memory)/i.test(sentence) ||
      tagSlug.startsWith("agent-")
        ? "agent"
        : "user";
    candidates.push({
      title: truncate(toImperativeTitle(sentence), 100) ?? "Follow source recommendation",
      details: truncate(sentence, 400) ?? sentence,
      assigneeType,
      executionTarget: assigneeType === "agent" ? "agent-workflow" : "user-workflow",
      suggestedAction: truncate(sentence, 220) ?? sentence,
      confidence: 0.72,
      justification: `Detected an actionable recommendation around "${verb}".`
    });
  }

  return dedupeByTitle(candidates).slice(0, 3).map((item) => ({
    ...item,
    title: item.title || `Review ${tagSlug.replace(/-/g, " ")} recommendation`
  }));
}

function deriveSkills(text: string, tagSlug: string, quote?: string): DerivedSkillSuggestion[] {
  const needsSkill = /(agent|memory|prompt|workflow|tool|search|retrieval|audit)/i.test(text);
  if (!needsSkill) {
    return [];
  }

  const summary = truncate(extractSentences(text).slice(0, 2).join(" "), 260) ?? text;
  const proposedChange = quote ? `Add or refine guidance with this phrasing:\n> ${quote}` : summary;

  return [
    {
      title: `Refine ${tagSlug.replace(/-/g, " ")} skill guidance`,
      details: summary,
      proposedChange,
      targetSystem: "agents_md",
      confidence: quote ? 0.8 : 0.66,
      justification: quote
        ? "The source contains strong operational phrasing worth preserving in agent guidance."
        : "The source suggests a reusable workflow or instruction pattern for agents."
    }
  ];
}

function deriveResources(capture: CaptureLike, text: string, title: string): DerivedResourceSuggestion[] {
  const urls = collectResourceUrls(capture);
  const suggestions = urls
    .map((candidate) => deriveResourceFromUrl(candidate.url, candidate.title ?? title, text, capture.author))
    .filter((item): item is DerivedResourceSuggestion => Boolean(item));

  if (suggestions.length > 0) {
    return dedupeResources(suggestions).slice(0, 4);
  }

  if (capture.platform !== "web") {
    return [];
  }

  if (!isLikelyResource(capture.canonicalUrl, title, text)) {
    return [];
  }

  const fallback = deriveResourceFromUrl(capture.canonicalUrl, title, text, capture.author);
  return fallback ? [fallback] : [];
}

function isResourceOnlyCapture(capture: CaptureLike, text: string, resources: DerivedResourceSuggestion[]): boolean {
  if (resources.length === 0) return false;
  const sentences = extractSentences(text);
  const lowered = text.toLowerCase();
  const hasActionVerb = ACTION_VERBS.some((verb) => lowered.includes(verb));
  const hasViewpointLanguage = /(don'?t|stop|should|must|need to|because|instead of|tradeoff|scale|overthink)/i.test(text);
  const canonicalResourceMatch = resources.some((resource) => resource.resourceUrl === capture.canonicalUrl);

  if (canonicalResourceMatch && sentences.length <= 3 && !hasActionVerb && !hasViewpointLanguage) {
    return true;
  }

  if (sentences.length <= 2 && !hasActionVerb && !hasViewpointLanguage && /(tool|app|plugin|template|prompt|repo|repository)/i.test(text)) {
    return true;
  }

  return false;
}

function deriveAuthorRating(text: string): DerivedAuthorRating {
  const lowered = text.toLowerCase();
  const hypeHits = HYPE_TERMS.reduce((count, item) => count + (lowered.includes(item) ? 1 : 0), 0);
  const trustHits = TRUST_TERMS.reduce((count, item) => count + (lowered.includes(item) ? 1 : 0), 0);
  const hasSpecificNumbers = /\b\d{2,}\b/.test(text);
  const signalScore = clamp(5 + trustHits * 1.2 + (hasSpecificNumbers ? 1.2 : 0), 1, 10);
  const trustScore = clamp(5.2 + trustHits * 1.1 - hypeHits * 0.5, 1, 10);
  const hypeScore = clamp(2 + hypeHits * 1.8, 1, 10);
  const relevanceScore = clamp(5.5 + (TAG_RULES.some((rule) => rule.keywords.some((keyword) => lowered.includes(keyword))) ? 1.5 : 0), 1, 10);
  const net = trustScore + signalScore + relevanceScore - hypeScore * 0.5;

  return {
    suggestedTier: scoreToTier(net / 3),
    trustScore,
    signalScore,
    hypeScore,
    relevanceScore,
    confidence: 0.62,
    justification: hypeHits
      ? "Balanced useful specifics against hype language instead of treating prestige or excitement as trust."
      : "Suggested tier is based on specificity, proof-like language, and practical relevance."
  };
}

function deriveViewpoints(text: string, tagSlug: string, quote?: string): DerivedViewpoint[] {
  const sentences = extractSentences(text).filter((sentence) => /(don'?t|stop|should|must|need to|use it first|blast|scale|overthink)/i.test(sentence));
  const items = sentences.slice(0, 2).map((sentence) => {
    const lowered = sentence.toLowerCase();
    const stance = lowered.includes("don't") || lowered.includes("stop")
      ? "avoid"
      : lowered.includes("must") || lowered.includes("need to")
        ? "do"
        : lowered.includes("should")
          ? "tradeoff"
          : "caution";

    return {
      topic: tagSlug.replace(/-/g, " "),
      conflictKey: topicConflictKey(tagSlug, sentence),
      stance,
      claim: truncate(sentence, 220) ?? sentence,
      rationale: truncate(extractSentences(text).slice(1, 3).join(" "), 260) ?? undefined,
      evidenceQuote: quote && sentence.includes(quote.slice(0, 16)) ? quote : sentence,
      confidence: 0.68,
      justification: "Stored as a viewpoint so contradictory takes can coexist under the same topic."
    } satisfies DerivedViewpoint;
  });

  if (items.length > 0) {
    return items;
  }

  return [
    {
      topic: tagSlug.replace(/-/g, " "),
      conflictKey: topicConflictKey(tagSlug, text),
      stance: "tradeoff",
      claim: truncate(extractSentences(text)[0] ?? text, 220) ?? "General source viewpoint",
      rationale: truncate(extractSentences(text).slice(1, 3).join(" "), 260) ?? undefined,
      evidenceQuote: quote,
      confidence: 0.52,
      justification: "Fallback viewpoint extracted so source advice remains attributable and comparable later."
    }
  ];
}

type ResourceUrlCandidate = {
  title?: string;
  url: string;
};

export function extractDocumentTitle(markdown?: string): string | null {
  if (!markdown) return null;
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

export function extractDocumentBody(markdown?: string): string | null {
  if (!markdown) return null;
  const bodyMatch = markdown.match(/## Extracted Content\n([\s\S]+)/);
  if (bodyMatch?.[1]) {
    return bodyMatch[1].trim();
  }

  const summaryMatch = markdown.match(/## Summary\n([\s\S]+?)(?:\n## |\s*$)/);
  return summaryMatch?.[1]?.trim() ?? null;
}

function pickSourceQuote(text: string): string | undefined {
  const sentences = extractSentences(text);
  return sentences.find((sentence) => sentence.length >= 60 && sentence.length <= 220 && /[!"“”]|don't|must|should|bullshit/i.test(sentence));
}

function collectResourceUrls(capture: CaptureLike): ResourceUrlCandidate[] {
  const raw = capture.rawPayload as any;
  const externalLinks = Array.isArray(raw?.external_links) ? raw.external_links : [];
  const collected: ResourceUrlCandidate[] = [];

  for (const item of externalLinks) {
    const url = typeof item?.url === "string" ? item.url : null;
    if (!url) continue;
    if (!isLikelyResource(url, item?.title, item?.summary ?? "")) continue;
    collected.push({
      url,
      title: typeof item?.title === "string" ? item.title : undefined
    });
  }

  const linkPreviewUrl = typeof raw?.link_preview?.url === "string" ? raw.link_preview.url : null;
  if (linkPreviewUrl && isLikelyResource(linkPreviewUrl, raw?.link_preview?.title, raw?.link_preview?.summary ?? "")) {
    collected.push({
      url: linkPreviewUrl,
      title: typeof raw?.link_preview?.title === "string" ? raw.link_preview.title : undefined
    });
  }

  if (capture.platform === "web" && isLikelyResource(capture.canonicalUrl, capture.titleHint, "")) {
    collected.push({
      url: capture.canonicalUrl,
      title: capture.titleHint
    });
  }

  return dedupeResourceCandidates(collected);
}

function deriveResourceFromUrl(url: string, title: string, text: string, author?: string): DerivedResourceSuggestion | null {
  const domain = safeDomain(url);
  if (!domain) return null;
  const resourceType = classifyResourceType(url, title, text);
  const name = deriveResourceName(url, title);
  const useCases = deriveResourceUseCases(text);
  const creator = domain.includes("github.com") ? inferGitHubOwner(url) : undefined;
  const company = domain.includes("figma.com") ? "Figma" : domain.includes("github.com") ? "GitHub" : inferCompanyFromDomain(domain);

  return {
    resourceUrl: url,
    resourceType,
    name,
    creator: creator ?? author ?? undefined,
    company,
    useCases,
    details: truncate(extractSentences(text).slice(0, 2).join(" "), 260) ?? title,
    confidence: 0.7,
    justification: "Detected a named or linked resource that should live separately from notes, tasks, and skills."
  };
}

function extractSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.?!])\s+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function deriveResourceUseCases(text: string): string[] {
  const lower = text.toLowerCase();
  return TAG_RULES.filter((rule) => rule.keywords.some((keyword) => lower.includes(keyword)))
    .slice(0, 3)
    .map((rule) => rule.name);
}

function toImperativeTitle(sentence: string): string {
  const cleaned = sentence
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function truncate(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number(value.toFixed(2))));
}

function isLikelyResource(url: string, title?: string, text?: string): boolean {
  const domain = safeDomain(url);
  const haystack = `${title ?? ""} ${text ?? ""}`.toLowerCase();
  if (!domain) return false;
  if (domain.includes("github.com") || domain.includes("figma.com") || domain.includes("npmjs.com")) return true;
  if (/(download|plugin|template|prompt|tool|app|repo|repository|extension|skill)/i.test(haystack)) return true;
  return RESOURCE_HINT_TERMS.some((term) => haystack.includes(term));
}

function classifyResourceType(url: string, title?: string, text?: string): string {
  const domain = safeDomain(url) ?? "";
  const haystack = `${title ?? ""} ${text ?? ""}`.toLowerCase();
  if (domain.includes("github.com")) return "github";
  if (domain.includes("figma.com")) return "design-file";
  if (domain.includes("npmjs.com")) return "package";
  if (/plugin|extension/.test(haystack)) return "plugin";
  if (/template/.test(haystack)) return "template";
  if (/prompt/.test(haystack)) return "prompt";
  if (/skill/.test(haystack)) return "skill";
  return "tool";
}

function deriveResourceName(url: string, title?: string): string {
  if (title && title.trim()) return truncate(title, 120) ?? title;
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function inferGitHubOwner(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts[0];
  } catch {
    return undefined;
  }
}

function inferCompanyFromDomain(domain: string): string {
  return domain
    .replace(/^www\./, "")
    .split(".")[0]
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function safeDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function scoreToTier(score: number): string {
  if (score >= 8.2) return "S";
  if (score >= 7.2) return "A";
  if (score >= 6.2) return "B";
  if (score >= 5.2) return "C";
  if (score >= 4.2) return "D";
  if (score >= 3.2) return "E";
  return "F";
}

function dedupeByTitle<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const key = slugifyTag(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function dedupeResourceCandidates(items: ResourceUrlCandidate[]): ResourceUrlCandidate[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeResourceKey({ resourceUrl: item.url });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeResources(items: DerivedResourceSuggestion[]): DerivedResourceSuggestion[] {
  const seen = new Set<string>();
  const deduped: DerivedResourceSuggestion[] = [];
  for (const item of items) {
    const key = normalizeResourceKey({ resourceUrl: item.resourceUrl });
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function findExistingTagName(candidate: string, existingTagNames: string[]): string | undefined {
  const candidateSlug = slugifyTag(candidate);
  return existingTagNames.find((item) => slugifyTag(item) === candidateSlug);
}
