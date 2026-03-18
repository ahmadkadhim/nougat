import test from "node:test";
import assert from "node:assert/strict";
import {
  extractDocumentBody,
  normalizeEvaluatorBundle,
  normalizeResourceKey,
  normalizeSkillKey,
  normalizeTaskKey,
  slugifyTag
} from "../convex/lib/derived.ts";

const baseContext = {
  availableLinks: [
    { title: "Cinematic Design Guide", url: "https://example.com/design-guide" },
    { title: "acme/cold-outreach", url: "https://github.com/acme/cold-outreach" }
  ],
  existingTagNames: ["Design", "Cold Outreach"],
  text: "Source text",
  title: "Source title"
};

test("slugifyTag canonicalizes tag names", () => {
  assert.equal(slugifyTag("Cold Outreach"), "cold-outreach");
  assert.equal(slugifyTag("Agent Memory / Retrieval"), "agent-memory-retrieval");
});

test("extractDocumentBody prefers extracted content", () => {
  const body = extractDocumentBody(`---\n---\n# Title\n\n## Summary\nShort summary\n\n## Extracted Content\nUse it first. Memory problems are discovered by running.`);
  assert.equal(body, "Use it first. Memory problems are discovered by running.");
});

test("normalizeEvaluatorBundle keeps durable notes and drops meta why scaffolding", () => {
  const bundle = normalizeEvaluatorBundle(
    {
      captureAssessment: {
        abstainReasons: [],
        archetype: "tactic",
        summary: "A design tactics post."
      },
      notes: [
        {
          title: "Lead with motion references",
          content: "Keep the source texture here:\nUse video references when describing desired motion.",
          sourceQuote: "Use videos to communicate motion.",
          why: "This note captures a durable tactic for communicating design direction."
        },
        {
          title: "Meta note",
          content: "We formatted this into a note.",
          why: "Preserved a vivid source quote instead of sanding it down."
        }
      ],
      resources: [],
      tags: [{ name: "Design", role: "primary", why: "Keeps this capture grouped with other design guidance." }],
      tasks: []
    },
    baseContext
  );

  assert.equal(bundle.notes.length, 1);
  assert.equal(bundle.notes[0]?.title, "Lead with motion references");
  assert.match(bundle.notes[0]?.content ?? "", /Use video references/);
  assert.ok(bundle.validationLog.some((entry) => entry.lane === "note" && /meta/i.test(entry.reason)));
});

test("normalizeEvaluatorBundle rejects generic advice phrased as a task", () => {
  const bundle = normalizeEvaluatorBundle(
    {
      captureAssessment: {
        abstainReasons: [],
        archetype: "tactic",
        summary: "A design advice post."
      },
      notes: [],
      resources: [],
      tags: [{ name: "Design", role: "primary", why: "Main topic." }],
      tasks: [
        {
          assigneeType: "user",
          details: "Don't be afraid to use videos.",
          title: "Don't be afraid to use videos",
          why: "This belongs in Nougat."
        }
      ]
    },
    baseContext
  );

  assert.equal(bundle.tasks.length, 0);
  assert.ok(bundle.validationLog.some((entry) => entry.lane === "task"));
});

test("normalizeEvaluatorBundle keeps setup tasks when article-backed implementation detail is present", () => {
  const bundle = normalizeEvaluatorBundle(
    {
      captureAssessment: {
        abstainReasons: [],
        archetype: "workflow_recommendation",
        summary: "A linked article recommends a concrete memory stack."
      },
      notes: [],
      resources: [],
      tags: [{ name: "Agent Memory", role: "primary", why: "Primary topic." }],
      tasks: [
        {
          assigneeType: "user",
          details:
            "1. Create an Obsidian vault for Claude session memory.\n2. Install the required plugins and configure templates in `.obsidian/plugins.json`.\n3. Add the retrieval prompt file at `prompts/memory.md` and test the stack with a new Claude session.\n4. Run `git init` to version the vault setup.",
          executionTarget: "local-tooling",
          suggestedAction: "set_up_stack",
          title: "Set up Claude + Obsidian memory stack",
          triggerContext: "When improving long-term memory for Claude sessions",
          why: "The article recommends a concrete stack and includes implementation detail worth trying."
        }
      ]
    },
    baseContext
  );

  assert.equal(bundle.tasks.length, 1);
  assert.match(bundle.tasks[0]?.details ?? "", /Obsidian vault/);
});

test("normalizeEvaluatorBundle rejects setup tasks that lack implementation detail", () => {
  const bundle = normalizeEvaluatorBundle(
    {
      captureAssessment: {
        abstainReasons: [],
        archetype: "workflow_recommendation",
        summary: "A linked article recommends a concrete memory stack."
      },
      notes: [],
      resources: [],
      tags: [{ name: "Agent Memory", role: "primary", why: "Primary topic." }],
      tasks: [
        {
          assigneeType: "user",
          details: "Try the Claude + Obsidian memory stack from the article.",
          executionTarget: "local-tooling",
          suggestedAction: "set_up_stack",
          title: "Set up Claude + Obsidian memory stack",
          triggerContext: "When improving long-term memory for Claude sessions",
          why: "The article recommends a concrete stack."
        }
      ]
    },
    baseContext
  );

  assert.equal(bundle.tasks.length, 0);
  assert.ok(
    bundle.validationLog.some((entry) => entry.lane === "task" && /source-backed steps, commands, files, or configuration detail/i.test(entry.reason))
  );
});

test("normalizeEvaluatorBundle resolves resources from source links and dedupes tags", () => {
  const bundle = normalizeEvaluatorBundle(
    {
      captureAssessment: {
        abstainReasons: [],
        archetype: "resource_roundup",
        summary: "A source that mentions one resource."
      },
      notes: [],
      resources: [
        {
          details: "A guide to cinematic UI motion.",
          name: "Cinematic Design Guide",
          resourceType: "guide",
          why: "The linked guide is worth keeping as a reusable resource."
        }
      ],
      tags: [
        { name: "Design", role: "primary", why: "Primary topic." },
        { name: "design", role: "secondary", why: "Duplicate should be dropped." }
      ],
      tasks: []
    },
    baseContext
  );

  assert.equal(bundle.resources[0]?.resourceUrl, "https://example.com/design-guide");
  assert.equal(bundle.tags.length, 1);
});

test("normalizeEvaluatorBundle only keeps coherent skill drafts", () => {
  const valid = normalizeEvaluatorBundle(
    {
      captureAssessment: {
        abstainReasons: [],
        archetype: "framework",
        summary: "A reusable workflow."
      },
      notes: [],
      resources: [],
      skillCandidate: {
        details: "Turn the post into a reusable skill draft.",
        mode: "draft",
        proposedChange:
          "Purpose\nCapture design references with enough context.\n\nWhen to use\nUse this when a design post contains actionable process guidance.\n\nSteps\n1. Save the reference.\n2. Add the operative constraint.\n\nCaveats\nSkip skill creation when the advice conflicts with itself.",
        targetSystem: "agents_md",
        title: "Capture design references",
        why: "This is a coherent operating pattern that could become a reusable skill."
      },
      tags: [{ name: "Design", role: "primary", why: "Primary topic." }],
      tasks: []
    },
    baseContext
  );

  const invalid = normalizeEvaluatorBundle(
    {
      captureAssessment: {
        abstainReasons: [],
        archetype: "framework",
        summary: "A reusable workflow."
      },
      notes: [],
      resources: [],
      skillCandidate: {
        details: "Missing sections.",
        mode: "draft",
        proposedChange: "Purpose\nDo the thing.",
        targetSystem: "agents_md",
        title: "Incomplete draft",
        why: "This should become a skill."
      },
      tags: [{ name: "Design", role: "primary", why: "Primary topic." }],
      tasks: []
    },
    baseContext
  );

  assert.equal(valid.skillCandidate?.mode, "draft");
  assert.equal(invalid.skillCandidate, null);
  assert.ok(invalid.validationLog.some((entry) => entry.lane === "skill" && /missing required sections/i.test(entry.reason)));
});

test("normalize keys remain stable for tasks, skills, and resources", () => {
  assert.equal(
    normalizeTaskKey({ assigneeType: "agent", tagSlug: "agent-memory", title: "Turn on hybrid search" }),
    normalizeTaskKey({ assigneeType: "agent", tagSlug: "agent-memory", title: "Turn on hybrid search" })
  );

  assert.equal(
    normalizeSkillKey({ mode: "draft", targetSystem: "agents_md", tagSlug: "agent-memory", title: "Refine memory guidance" }),
    "draft-agents-md-new-agent-memory-refine-memory-guidance"
  );
  assert.equal(
    normalizeResourceKey({ resourceUrl: "https://github.com/acme/repo" }),
    "https-github-com-acme-repo"
  );
});
