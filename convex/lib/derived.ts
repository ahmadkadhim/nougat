type CaptureLike = {
  author?: string;
  canonicalUrl: string;
  captureId: string;
  ownerAuthUserId?: string;
  platform: string;
  platformIds?: Record<string, unknown>;
  rawPayload?: unknown;
  selectedText?: string;
  tabContext?: string;
  titleHint?: string;
};

type MarkdownLike = {
  markdown?: string;
};

type CaptureResourceHint = {
  title?: string;
  url: string;
};

type EvaluatorContext = {
  availableLinks: CaptureResourceHint[];
  existingTagNames: string[];
  text: string;
  title: string;
};

type EvaluatorResponse = {
  authorRating?: unknown;
  captureAssessment?: unknown;
  notes?: unknown;
  resources?: unknown;
  skillCandidate?: unknown;
  tags?: unknown;
  tasks?: unknown;
};

export type DerivedCaptureAssessment = {
  abstainReasons: string[];
  archetype: string;
  summary: string;
};

export type DerivedTagSuggestion = {
  confidence: number;
  name: string;
  role: "primary" | "secondary";
  slug: string;
  why?: string;
};

export type DerivedNoteSuggestion = {
  confidence: number;
  content: string;
  sourceQuote?: string;
  title: string;
  why: string;
};

export type DerivedTaskSuggestion = {
  assigneeType: "user" | "agent";
  confidence: number;
  details: string;
  executionTarget?: string;
  suggestedAction?: string;
  title: string;
  triggerContext?: string;
  why: string;
};

export type DerivedSkillSuggestion = {
  confidence: number;
  details: string;
  mode: "draft" | "delta";
  proposedChange: string;
  targetSkillRef?: string;
  targetSystem: string;
  title: string;
  why: string;
};

export type DerivedResourceSuggestion = {
  company?: string;
  confidence: number;
  creator?: string;
  details: string;
  name: string;
  resourceType: string;
  resourceUrl: string;
  useCases: string[];
  why: string;
};

export type DerivedAuthorRating = {
  confidence: number;
  hypeScore: number;
  relevanceScore: number;
  signalScore: number;
  suggestedTier: string;
  trustScore: number;
  why?: string;
};

export type ValidationRejection = {
  lane: "authorRating" | "note" | "resource" | "skill" | "tag" | "task";
  reason: string;
};

export type DerivedEvaluationBundle = {
  authorRating: DerivedAuthorRating | null;
  captureAssessment: DerivedCaptureAssessment;
  notes: DerivedNoteSuggestion[];
  resources: DerivedResourceSuggestion[];
  skillCandidate: DerivedSkillSuggestion | null;
  tags: DerivedTagSuggestion[];
  tasks: DerivedTaskSuggestion[];
  validationLog: ValidationRejection[];
};

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_EVALUATOR_MODEL = "gpt-5.2";
const MAX_TEXT_LENGTH = 10_000;
const BANNED_SCAFFOLDING_PHRASES = [
  "keep the source texture here",
  "preserved a vivid source quote",
  "instead of sanding it down",
  "stored as a viewpoint",
  "fallback viewpoint extracted",
  "formatted this",
  "turned this into",
  "transformed this"
];
const META_WHY_PATTERNS = [
  /preserv(?:e|ed|ing)\b/i,
  /format(?:ted|ting)?\b/i,
  /rewrite(?:n|s|ing)?\b/i,
  /summari(?:s|z)(?:e|ed|ing)\b/i,
  /converted?\b/i,
  /because the prompt/i,
  /source texture/i
];
const TASK_ACTION_VERBS = [
  "add",
  "audit",
  "build",
  "configure",
  "connect",
  "capture",
  "create",
  "document",
  "draft",
  "enable",
  "evaluate",
  "initialize",
  "install",
  "link",
  "move",
  "pull",
  "review",
  "run",
  "save",
  "set",
  "ship",
  "sync",
  "test",
  "update",
  "write"
];
const TASK_OBJECT_PATTERNS = [
  /\bagent\b/i,
  /\bcapture\b/i,
  /\bclaude\b/i,
  /\bcommand\b/i,
  /\bcomment\b/i,
  /\bconfig(?:uration)?\b/i,
  /\bexport\b/i,
  /\bfield\b/i,
  /\bfile\b/i,
  /\bfolder\b/i,
  /\binbox\b/i,
  /\blink\b/i,
  /\bmarkdown\b/i,
  /\bmemory\b/i,
  /\bnote(?:s)?\b/i,
  /\bobsidian\b/i,
  /\bplugin\b/i,
  /\bprompt\b/i,
  /\bqueue\b/i,
  /\brepo(?:sitory)?\b/i,
  /\bresource\b/i,
  /\bretrieval\b/i,
  /\breview\b/i,
  /\bsearch\b/i,
  /\bskill\b/i,
  /\bstack\b/i,
  /\bsync\b/i,
  /\bsystem\b/i,
  /\btag\b/i,
  /\btask\b/i,
  /\btool(?:ing)?\b/i,
  /\burl\b/i,
  /\bvault\b/i,
  /\bworkflow\b/i
];
const TASK_SETUP_PATTERNS = [
  /\bconfigure\b/i,
  /\bmemory stack\b/i,
  /\bplaybook\b/i,
  /\bset ?up\b/i,
  /\bstack\b/i,
  /\bsystem\b/i,
  /\btemplate\b/i,
  /\bworkflow\b/i
];
const TASK_IMPLEMENTATION_PATTERNS = [
  /(^|\n)\s*(?:\d+\.|- |\* )\S/m,
  /`[^`]+`/,
  /\b(?:npm|pnpm|yarn|bun|uv|pip|poetry|git|brew|docker|claude|obsidian)\b/i,
  /\b[A-Za-z0-9_.-]+\.(?:env|json|yaml|yml|md|txt|js|jsx|ts|tsx|py|sh)\b/,
  /(?:^|\s)\/?[\w.-]+\/[\w./-]+/,
  /\b(?:create|edit|add|open|save|configure|connect|install|enable|run|test|verify)\b.{0,60}\b(?:file|folder|vault|plugin|command|repo|config|template|prompt|note)\b/i,
  /\b(?:first|then|next|finally|step \d+)\b/i
];
const NOTE_META_PATTERNS = [/meta/i, /format/i, /prompt/i, /this note/i, /review queue/i];
const TIER_VALUES = new Set(["S", "A", "B", "C", "D", "E", "F"]);

const EVALUATOR_SCHEMA = {
  additionalProperties: false,
  properties: {
    captureAssessment: {
      additionalProperties: false,
      properties: {
        abstainReasons: { items: { type: "string" }, type: "array" },
        archetype: { type: "string" },
        summary: { type: "string" }
      },
      required: ["archetype", "summary", "abstainReasons"],
      type: "object"
    },
    tags: {
      items: {
        additionalProperties: false,
        properties: {
          confidence: { type: "number" },
          name: { type: "string" },
          role: { enum: ["primary", "secondary"], type: "string" },
          why: { type: "string" }
        },
        required: ["confidence", "name", "role", "why"],
        type: "object"
      },
      type: "array"
    },
    notes: {
      items: {
        additionalProperties: false,
        properties: {
          confidence: { type: "number" },
          content: { type: "string" },
          sourceQuote: { type: ["string", "null"] },
          title: { type: "string" },
          why: { type: "string" }
        },
        required: ["confidence", "content", "sourceQuote", "title", "why"],
        type: "object"
      },
      type: "array"
    },
    tasks: {
      items: {
        additionalProperties: false,
        properties: {
          assigneeType: { enum: ["user", "agent"], type: "string" },
          confidence: { type: "number" },
          details: { type: "string" },
          executionTarget: { type: ["string", "null"] },
          suggestedAction: { type: ["string", "null"] },
          title: { type: "string" },
          triggerContext: { type: ["string", "null"] },
          why: { type: "string" }
        },
        required: ["assigneeType", "confidence", "details", "executionTarget", "suggestedAction", "title", "triggerContext", "why"],
        type: "object"
      },
      type: "array"
    },
    resources: {
      items: {
        additionalProperties: false,
        properties: {
          company: { type: ["string", "null"] },
          confidence: { type: "number" },
          creator: { type: ["string", "null"] },
          details: { type: "string" },
          name: { type: "string" },
          resourceType: { type: "string" },
          resourceUrl: { type: ["string", "null"] },
          useCases: { items: { type: "string" }, type: "array" },
          why: { type: "string" }
        },
        required: ["company", "confidence", "creator", "details", "name", "resourceType", "resourceUrl", "useCases", "why"],
        type: "object"
      },
      type: "array"
    },
    skillCandidate: {
      anyOf: [
        {
          additionalProperties: false,
          properties: {
            confidence: { type: "number" },
            details: { type: "string" },
            mode: { enum: ["draft", "delta"], type: "string" },
            proposedChange: { type: "string" },
            targetSkillRef: { type: ["string", "null"] },
            targetSystem: { type: "string" },
            title: { type: "string" },
            why: { type: "string" }
          },
          required: ["confidence", "details", "mode", "proposedChange", "targetSkillRef", "targetSystem", "title", "why"],
          type: "object"
        },
        { type: "null" }
      ]
    },
    authorRating: {
      anyOf: [
        {
          additionalProperties: false,
          properties: {
            confidence: { type: "number" },
            hypeScore: { type: "number" },
            relevanceScore: { type: "number" },
            signalScore: { type: "number" },
            suggestedTier: { enum: ["S", "A", "B", "C", "D", "E", "F"], type: "string" },
            trustScore: { type: "number" },
            why: { type: "string" }
          },
          required: ["confidence", "hypeScore", "relevanceScore", "signalScore", "suggestedTier", "trustScore", "why"],
          type: "object"
        },
        { type: "null" }
      ]
    }
  },
  required: ["authorRating", "captureAssessment", "notes", "resources", "skillCandidate", "tags", "tasks"],
  type: "object"
};

export async function buildDerivedEvaluation(input: {
  capture: CaptureLike;
  document?: MarkdownLike | null;
  existingTagNames?: string[];
}): Promise<DerivedEvaluationBundle> {
  const text =
    extractDocumentBody(input.document?.markdown) ??
    cleanText(input.capture.selectedText) ??
    cleanText(input.capture.tabContext) ??
    cleanText(input.capture.titleHint) ??
    input.capture.canonicalUrl;
  const title = extractDocumentTitle(input.document?.markdown) ?? cleanText(input.capture.titleHint) ?? "Untitled capture";
  const availableLinks = collectResourceUrls(input.capture);

  const raw = await callOpenAIEvaluator({
    availableLinks,
    capture: input.capture,
    existingTagNames: input.existingTagNames ?? [],
    text,
    title
  });

  return normalizeEvaluatorBundle(raw, {
    availableLinks,
    existingTagNames: input.existingTagNames ?? [],
    text,
    title
  });
}

export function normalizeEvaluatorBundle(raw: EvaluatorResponse, context: EvaluatorContext): DerivedEvaluationBundle {
  const validationLog: ValidationRejection[] = [];
  const captureAssessment = normalizeCaptureAssessment(raw.captureAssessment);
  const tags = normalizeTags(raw.tags, context.existingTagNames, validationLog);
  const notes = normalizeNotes(raw.notes, validationLog);
  const tasks = normalizeTasks(raw.tasks, validationLog);
  const resources = normalizeResources(raw.resources, context.availableLinks, validationLog);
  const skillCandidate = normalizeSkill(raw.skillCandidate, validationLog);
  const authorRating = normalizeAuthorRating(raw.authorRating, validationLog);

  return {
    authorRating,
    captureAssessment,
    notes,
    resources,
    skillCandidate,
    tags,
    tasks,
    validationLog
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
  mode: "draft" | "delta";
  tagSlug?: string;
  targetSkillRef?: string;
  targetSystem: string;
  title: string;
}): string {
  return slugifyTag(`${input.mode}-${input.targetSystem}-${input.targetSkillRef ?? "new"}-${input.tagSlug ?? "general"}-${input.title}`);
}

export function normalizeResourceKey(input: { resourceUrl: string }): string {
  return slugifyTag(normalizeUrl(input.resourceUrl));
}

export function extractDocumentTitle(markdown?: string): string | null {
  if (!markdown) return null;
  const match = markdown.match(/^#\s+(.+)$/m);
  return cleanText(match?.[1]) ?? null;
}

export function extractDocumentBody(markdown?: string): string | null {
  if (!markdown) return null;
  const bodyMatch = markdown.match(/## Extracted Content\n([\s\S]+)/);
  if (bodyMatch?.[1]) {
    return cleanText(bodyMatch[1]) ?? null;
  }

  const summaryMatch = markdown.match(/## Summary\n([\s\S]+?)(?:\n## |\s*$)/);
  return cleanText(summaryMatch?.[1]) ?? null;
}

function normalizeCaptureAssessment(raw: unknown): DerivedCaptureAssessment {
  const candidate = isRecord(raw) ? raw : {};
  return {
    abstainReasons: Array.isArray(candidate.abstainReasons)
      ? candidate.abstainReasons.map((item) => cleanText(item)).filter((item): item is string => Boolean(item)).slice(0, 6)
      : [],
    archetype: cleanText(candidate.archetype) ?? "uncategorized",
    summary: cleanText(candidate.summary) ?? "No summary returned by evaluator."
  };
}

function normalizeTags(raw: unknown, existingTagNames: string[], validationLog: ValidationRejection[]): DerivedTagSuggestion[] {
  const items = Array.isArray(raw) ? raw : [];
  const deduped: DerivedTagSuggestion[] = [];
  const seen = new Set<string>();

  for (const candidate of items) {
    if (!isRecord(candidate)) {
      validationLog.push({ lane: "tag", reason: "Dropped malformed tag suggestion." });
      continue;
    }

    const role = candidate.role === "secondary" ? "secondary" : candidate.role === "primary" ? "primary" : null;
    const rawName = cleanText(candidate.name);
    if (!role || !rawName) {
      validationLog.push({ lane: "tag", reason: "Dropped tag missing a valid name or role." });
      continue;
    }

    const preferredName = preferExistingTagName(rawName, existingTagNames) ?? rawName;
    const slug = slugifyTag(preferredName);
    if (!slug || seen.has(slug)) {
      validationLog.push({ lane: "tag", reason: `Dropped duplicate tag "${preferredName}".` });
      continue;
    }

    seen.add(slug);
    deduped.push({
      confidence: clampConfidence(candidate.confidence, role === "primary" ? 0.76 : 0.66),
      name: preferredName,
      role,
      slug,
      why: normalizeWhy(candidate.why, `Keeps the capture filed under ${preferredName}.`)
    });
  }

  if (deduped.length === 0) {
    return [
      {
        confidence: 0.45,
        name: preferExistingTagName("General", existingTagNames) ?? "General",
        role: "primary",
        slug: slugifyTag(preferExistingTagName("General", existingTagNames) ?? "General"),
        why: "Keeps the capture reviewable even when the source does not fit a stronger existing tag."
      }
    ];
  }

  const primary = deduped.find((item) => item.role === "primary") ?? deduped[0];
  return deduped.slice(0, 3).map((item, index) => ({
    ...item,
    role: item.slug === primary.slug || index === 0 && !deduped.some((entry) => entry.role === "primary") ? "primary" : "secondary"
  }));
}

function normalizeNotes(raw: unknown, validationLog: ValidationRejection[]): DerivedNoteSuggestion[] {
  const items = Array.isArray(raw) ? raw : [];
  const deduped: DerivedNoteSuggestion[] = [];
  const seen = new Set<string>();

  for (const candidate of items) {
    if (!isRecord(candidate)) {
      validationLog.push({ lane: "note", reason: "Dropped malformed note suggestion." });
      continue;
    }

    const title = cleanText(candidate.title);
    const content = stripBannedScaffolding(candidate.content);
    const why = normalizeWhy(candidate.why);
    if (!title || !content) {
      validationLog.push({ lane: "note", reason: "Dropped note missing a title or content." });
      continue;
    }
    if (isMetaOnlyNote(title, content) || !why || looksMetaWhy(why)) {
      validationLog.push({ lane: "note", reason: `Dropped note "${title}" because it looked meta or its why did not describe durable value.` });
      continue;
    }

    const key = slugifyTag(`${title}-${content.slice(0, 80)}`);
    if (seen.has(key)) {
      validationLog.push({ lane: "note", reason: `Dropped duplicate note "${title}".` });
      continue;
    }

    seen.add(key);
    deduped.push({
      confidence: clampConfidence(candidate.confidence, 0.74),
      content,
      sourceQuote: stripBannedScaffolding(candidate.sourceQuote),
      title,
      why
    });
  }

  return deduped.slice(0, 2);
}

function normalizeTasks(raw: unknown, validationLog: ValidationRejection[]): DerivedTaskSuggestion[] {
  const items = Array.isArray(raw) ? raw : [];
  const deduped: DerivedTaskSuggestion[] = [];
  const seen = new Set<string>();

  for (const candidate of items) {
    if (!isRecord(candidate)) {
      validationLog.push({ lane: "task", reason: "Dropped malformed task suggestion." });
      continue;
    }

    const assigneeType = candidate.assigneeType === "agent" ? "agent" : candidate.assigneeType === "user" ? "user" : null;
    const title = cleanText(candidate.title);
    const details = cleanText(candidate.details);
    const executionTarget = cleanText(candidate.executionTarget);
    const triggerContext = cleanText(candidate.triggerContext);
    const suggestedAction = cleanText(candidate.suggestedAction);
    const why = normalizeWhy(candidate.why);

    if (!assigneeType || !title || !details) {
      validationLog.push({ lane: "task", reason: "Dropped task missing an owner, title, or details." });
      continue;
    }

    if (!executionTarget && !triggerContext) {
      validationLog.push({ lane: "task", reason: `Dropped task "${title}" because it had no execution target or trigger context.` });
      continue;
    }

    if (!looksConcreteTask(title, details) || looksLikeGenericAdvice(title, details) || !why) {
      validationLog.push({ lane: "task", reason: `Dropped task "${title}" because it read like generic advice instead of a concrete action.` });
      continue;
    }

    if (looksLikeSetupRecommendation(title, details) && !hasImplementationDetail(details)) {
      validationLog.push({
        lane: "task",
        reason: `Dropped task "${title}" because setup-style tasks need source-backed steps, commands, files, or configuration detail.`
      });
      continue;
    }

    const key = normalizeTaskKey({ assigneeType, title });
    if (seen.has(key)) {
      validationLog.push({ lane: "task", reason: `Dropped duplicate task "${title}".` });
      continue;
    }

    seen.add(key);
    deduped.push({
      assigneeType,
      confidence: clampConfidence(candidate.confidence, 0.72),
      details,
      executionTarget,
      suggestedAction,
      title,
      triggerContext,
      why
    });
  }

  return deduped.slice(0, 2);
}

function normalizeResources(
  raw: unknown,
  availableLinks: CaptureResourceHint[],
  validationLog: ValidationRejection[]
): DerivedResourceSuggestion[] {
  const items = Array.isArray(raw) ? raw : [];
  const deduped: DerivedResourceSuggestion[] = [];
  const seen = new Set<string>();

  for (const candidate of items) {
    if (!isRecord(candidate)) {
      validationLog.push({ lane: "resource", reason: "Dropped malformed resource suggestion." });
      continue;
    }

    const name = cleanText(candidate.name);
    const details = cleanText(candidate.details);
    const why = normalizeWhy(candidate.why);
    const resourceType = cleanText(candidate.resourceType) ?? "resource";
    const resolvedUrl = resolveResourceUrl(candidate.resourceUrl, name, availableLinks);
    if (!name || !details || !why || !resolvedUrl) {
      validationLog.push({ lane: "resource", reason: `Dropped resource "${name ?? "untitled"}" because it was missing durable details or a resolvable URL.` });
      continue;
    }

    const key = normalizeResourceKey({ resourceUrl: resolvedUrl });
    if (seen.has(key)) {
      validationLog.push({ lane: "resource", reason: `Dropped duplicate resource "${name}".` });
      continue;
    }

    seen.add(key);
    deduped.push({
      company: cleanText(candidate.company),
      confidence: clampConfidence(candidate.confidence, 0.7),
      creator: cleanText(candidate.creator),
      details,
      name,
      resourceType,
      resourceUrl: resolvedUrl,
      useCases: normalizeStringArray(candidate.useCases, 4),
      why
    });
  }

  return deduped.slice(0, 3);
}

function normalizeSkill(raw: unknown, validationLog: ValidationRejection[]): DerivedSkillSuggestion | null {
  if (!isRecord(raw)) return null;

  const title = cleanText(raw.title);
  const details = cleanText(raw.details);
  const mode = raw.mode === "delta" ? "delta" : raw.mode === "draft" ? "draft" : null;
  const targetSystem = cleanText(raw.targetSystem);
  const targetSkillRef = cleanText(raw.targetSkillRef);
  const proposedChange = cleanText(raw.proposedChange);
  const why = normalizeWhy(raw.why);

  if (!title || !details || !mode || !targetSystem || !proposedChange || !why) {
    validationLog.push({ lane: "skill", reason: "Dropped malformed skill candidate." });
    return null;
  }

  if (mode === "draft") {
    const missingSections = requiredSkillDraftSections().filter((section) => !hasNamedSection(proposedChange, section));
    if (missingSections.length > 0) {
      validationLog.push({
        lane: "skill",
        reason: `Dropped skill "${title}" because its draft was missing required sections: ${missingSections.join(", ")}.`
      });
      return null;
    }
    if (hasContradictoryInstructions(proposedChange)) {
      validationLog.push({ lane: "skill", reason: `Dropped skill "${title}" because its draft contained contradictory instructions.` });
      return null;
    }
  }

  if (mode === "delta" && !targetSkillRef) {
    validationLog.push({ lane: "skill", reason: `Dropped skill "${title}" because delta mode requires a target skill reference.` });
    return null;
  }

  return {
    confidence: clampConfidence(raw.confidence, 0.68),
    details,
    mode,
    proposedChange,
    targetSkillRef,
    targetSystem,
    title,
    why
  };
}

function normalizeAuthorRating(raw: unknown, validationLog: ValidationRejection[]): DerivedAuthorRating | null {
  if (!isRecord(raw)) return null;
  const suggestedTier = cleanText(raw.suggestedTier)?.toUpperCase();
  const why = normalizeWhy(raw.why);
  if (!suggestedTier || !TIER_VALUES.has(suggestedTier) || !why) {
    validationLog.push({ lane: "authorRating", reason: "Dropped malformed author rating." });
    return null;
  }

  return {
    confidence: clampConfidence(raw.confidence, 0.62),
    hypeScore: clampScore(raw.hypeScore, 5),
    relevanceScore: clampScore(raw.relevanceScore, 5),
    signalScore: clampScore(raw.signalScore, 5),
    suggestedTier,
    trustScore: clampScore(raw.trustScore, 5),
    why
  };
}

async function callOpenAIEvaluator(input: {
  availableLinks: CaptureResourceHint[];
  capture: CaptureLike;
  existingTagNames: string[];
  text: string;
  title: string;
}): Promise<EvaluatorResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY for Nougat evaluator");
  }

  const model = process.env.OPENAI_EVALUATOR_MODEL ?? DEFAULT_EVALUATOR_MODEL;
  const requestBody = {
    max_output_tokens: 3_500,
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You evaluate one captured source for Nougat. Nougat stores Inbox captures and proposes outputs: Notes, Tasks, Resources, and Skills. Tags and author ratings are reviewable metadata, not outputs. Return strict JSON only. Default to abstaining. Most captures should yield 0-2 outputs total.\n\nRules:\n- There is no viewpoint object. Claims, opinions, cautions, and disagreements are just Notes.\n- Notes should capture durable ideas or observations. Do not explain formatting, summarization, or transformation decisions.\n- Prefer article bodies, attached article text, and external link text over the social wrapper when they contain more substance.\n- Tasks require an explicit owner (user or agent), a concrete action and object, and either an executionTarget or triggerContext.\n- A task may be implicit. If the source recommends a concrete stack, setup, workflow, system, or tool combination that the user could adopt, emit a task even when the source is framed as an article title, link share, or recommendation post.\n- For setup or workflow tasks, details must compress the exact source-backed implementation context: steps, commands, files, tools, configuration points, and validation actions when present. Do not invent specifics that are absent from the source.\n- Resources require a specific URL from the source context or a clearly resolvable named resource present in the source context.\n- Skills are rare. Emit one only if you can produce either a coherent draft or a coherent delta. Drafts must include sections titled Purpose, When to use, Steps, and Caveats. Delta mode must include a targetSkillRef.\n- Use why to explain why the item deserves to exist in Nougat.\n- Keep confidence values between 0 and 1."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildEvaluatorPrompt(input)
          }
        ]
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "nougat_capture_evaluation",
        schema: EVALUATOR_SCHEMA,
        strict: true
      }
    }
  };

  const response = await fetch(OPENAI_API_URL, {
    body: JSON.stringify(requestBody),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI evaluator failed (${response.status}): ${body.slice(0, 400)}`);
  }

  const payload = await response.json();
  return extractStructuredOutput(payload);
}

function buildEvaluatorPrompt(input: {
  availableLinks: CaptureResourceHint[];
  capture: CaptureLike;
  existingTagNames: string[];
  text: string;
  title: string;
}) {
  const author = input.capture.author ?? "Unknown";
  const links = input.availableLinks
    .slice(0, 8)
    .map((item) => `- ${item.title ? `${item.title}: ` : ""}${item.url}`)
    .join("\n");

  return [
    `Capture ID: ${input.capture.captureId}`,
    `Platform: ${input.capture.platform}`,
    `Canonical URL: ${input.capture.canonicalUrl}`,
    `Author: ${author}`,
    `Title: ${input.title}`,
    `Existing tags: ${input.existingTagNames.length ? input.existingTagNames.join(", ") : "None yet"}`,
    `Resolvable links from the source:\n${links || "- none"}`,
    "Prompting note: when the source text includes attached article or external link sections, treat those sections as primary evidence for concrete tasks and write source-backed steps, commands, files, and actions into task details when available.",
    "Extracted source text:",
    truncateText(input.text, MAX_TEXT_LENGTH)
  ].join("\n\n");
}

function extractStructuredOutput(payload: any): EvaluatorResponse {
  const parsed = findParsedPayload(payload);
  if (parsed && isRecord(parsed)) {
    return parsed;
  }

  const text = extractOutputText(payload);
  if (!text) {
    throw new Error("OpenAI evaluator returned no parseable output");
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`OpenAI evaluator returned invalid JSON: ${error instanceof Error ? error.message : "parse failure"}`);
  }
}

function findParsedPayload(payload: any): unknown {
  if (isRecord(payload.output_parsed)) return payload.output_parsed;
  if (!Array.isArray(payload.output)) return null;
  for (const outputItem of payload.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) continue;
    for (const contentItem of outputItem.content) {
      if (isRecord(contentItem) && isRecord(contentItem.parsed)) {
        return contentItem.parsed;
      }
    }
  }
  return null;
}

function extractOutputText(payload: any): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload.output)) return "";
  const collected: string[] = [];

  for (const outputItem of payload.output) {
    if (!isRecord(outputItem)) continue;
    if (!Array.isArray(outputItem.content)) continue;

    for (const contentItem of outputItem.content) {
      if (!isRecord(contentItem)) continue;
      if (contentItem.type === "refusal") {
        throw new Error(`OpenAI evaluator refusal: ${cleanText(contentItem.refusal) ?? "unknown refusal"}`);
      }
      const text = cleanText(contentItem.text);
      if (text) {
        collected.push(text);
      }
    }
  }

  return collected.join("\n").trim();
}

function collectResourceUrls(capture: CaptureLike): CaptureResourceHint[] {
  const raw = capture.rawPayload as any;
  const externalLinks = Array.isArray(raw?.external_links) ? raw.external_links : [];
  const collected: CaptureResourceHint[] = [];

  for (const item of externalLinks) {
    const url = cleanText(item?.url);
    if (!url || !isValidHttpUrl(url)) continue;
    collected.push({
      title: cleanText(item?.title),
      url
    });
  }

  const previewUrl = cleanText(raw?.link_preview?.url);
  if (previewUrl && isValidHttpUrl(previewUrl)) {
    collected.push({
      title: cleanText(raw?.link_preview?.title),
      url: previewUrl
    });
  }

  if (capture.platform === "web" && isValidHttpUrl(capture.canonicalUrl)) {
    collected.push({
      title: cleanText(capture.titleHint),
      url: capture.canonicalUrl
    });
  }

  const seen = new Set<string>();
  return collected.filter((item) => {
    const key = normalizeResourceKey({ resourceUrl: item.url });
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function preferExistingTagName(name: string, existingTagNames: string[]) {
  const slug = slugifyTag(name);
  return existingTagNames.find((item) => slugifyTag(item) === slug);
}

function resolveResourceUrl(rawUrl: unknown, name: string | undefined, availableLinks: CaptureResourceHint[]) {
  const direct = cleanText(rawUrl);
  if (direct && isValidHttpUrl(direct)) {
    return direct;
  }
  if (!name) return null;

  const normalizedName = slugifyTag(name);
  const matched = availableLinks.find((item) => {
    const titleMatch = item.title ? slugifyTag(item.title) === normalizedName : false;
    const pathMatch = slugifyTag(item.url).includes(normalizedName);
    return titleMatch || pathMatch;
  });
  return matched?.url ?? null;
}

function requiredSkillDraftSections() {
  return ["Purpose", "When to use", "Steps", "Caveats"];
}

function hasNamedSection(content: string, section: string) {
  const pattern = new RegExp(`(^|\\n)#{0,3}\\s*${escapeRegExp(section)}\\s*:?(\\n|$)`, "i");
  return pattern.test(content);
}

function hasContradictoryInstructions(content: string) {
  const positive = new Set<string>();
  const negative = new Set<string>();
  const lines = content
    .split("\n")
    .map((item) => cleanText(item))
    .filter((item): item is string => typeof item === "string" && !/^#+\s/.test(item));

  for (const line of lines) {
    const lowered = line.toLowerCase();
    const isNegative = /^(do not|don't|never|avoid)\b/.test(lowered);
    const normalized = lowered
      .replace(/^(do not|don't|never|avoid|always|must|should|use|add|keep|make|write|include|remove|skip)\b/, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join(" ");

    if (normalized.length < 8) continue;
    if (isNegative) negative.add(normalized);
    else positive.add(normalized);
  }

  for (const key of positive) {
    if (negative.has(key)) return true;
  }

  return false;
}

function looksConcreteTask(title: string, details: string) {
  const haystack = `${title} ${details}`.toLowerCase();
  const hasVerb = TASK_ACTION_VERBS.some((verb) => haystack.includes(verb));
  const hasObject = TASK_OBJECT_PATTERNS.some((pattern) => pattern.test(haystack));
  return hasVerb && hasObject;
}

function looksLikeGenericAdvice(title: string, details: string) {
  const haystack = `${title} ${details}`.toLowerCase();
  if (/^don'?t\b|^never\b|^avoid\b/.test(title.toLowerCase())) return true;
  if (/\bshould\b|\bmust\b|\beveryone\b|\bpeople\b/.test(haystack) && !/\b(user|agent)\b/.test(haystack)) return true;
  return false;
}

function looksLikeSetupRecommendation(title: string, details: string) {
  const haystack = `${title} ${details}`;
  return TASK_SETUP_PATTERNS.some((pattern) => pattern.test(haystack));
}

function hasImplementationDetail(details: string) {
  const matches = TASK_IMPLEMENTATION_PATTERNS.filter((pattern) => pattern.test(details));
  return matches.length >= 2;
}

function isMetaOnlyNote(title: string, content: string) {
  const haystack = `${title} ${content}`;
  return NOTE_META_PATTERNS.some((pattern) => pattern.test(haystack)) && content.length < 220;
}

function normalizeWhy(value: unknown, fallback?: string) {
  const cleaned = stripBannedScaffolding(value);
  if (cleaned && !looksMetaWhy(cleaned)) {
    return cleaned;
  }
  return fallback ? cleanText(fallback) ?? undefined : undefined;
}

function looksMetaWhy(value: string) {
  return META_WHY_PATTERNS.some((pattern) => pattern.test(value));
}

function stripBannedScaffolding(value: unknown) {
  const cleaned = cleanText(value);
  if (!cleaned) return undefined;

  let normalized = cleaned;
  for (const phrase of BANNED_SCAFFOLDING_PHRASES) {
    const pattern = new RegExp(escapeRegExp(phrase), "ig");
    normalized = normalized.replace(pattern, "");
  }

  return cleanText(normalized) ?? undefined;
}

function normalizeStringArray(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}

function clampConfidence(value: unknown, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function clampScore(value: unknown, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(1, Math.min(10, Number(value.toFixed(1))));
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return normalized || undefined;
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
      url.port = "";
    }
    return url.toString();
  } catch {
    return value;
  }
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
