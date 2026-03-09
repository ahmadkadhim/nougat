import test from "node:test";
import assert from "node:assert/strict";
import { buildDerivedEvaluation, extractDocumentBody, normalizeResourceKey, normalizeSkillKey, normalizeTaskKey, slugifyTag, topicConflictKey } from "../convex/lib/derived.ts";

test("slugifyTag canonicalizes tag names", () => {
  assert.equal(slugifyTag("Cold Outreach"), "cold-outreach");
  assert.equal(slugifyTag("Agent Memory / Retrieval"), "agent-memory-retrieval");
});

test("extractDocumentBody prefers extracted content", () => {
  const body = extractDocumentBody(`---\n---\n# Title\n\n## Summary\nShort summary\n\n## Extracted Content\nUse it first. Memory problems are discovered by running.`);
  assert.equal(body, "Use it first. Memory problems are discovered by running.");
});

test("buildDerivedEvaluation preserves vivid phrasing in notes and viewpoints", () => {
  const bundle = buildDerivedEvaluation({
    capture: {
      captureId: "cap_1",
      canonicalUrl: "https://x.com/test/status/1",
      platform: "x",
      titleHint: "OpenClaw memory note"
    },
    document: {
      markdown:
        '---\n---\n# OpenClaw memory note\n\n## Extracted Content\n"Use it first. Memory problems are discovered by running, not by designing."\n\nStop overthinking and just turn on hybrid search with temporal decay.\n\nToo many people design three-tier memory architectures on day one.'
    },
    existingTagNames: ["Agent Memory"]
  });

  assert.equal(bundle.tags[0]?.name, "Agent Memory");
  assert.match(bundle.knowledgeItems[0]?.content ?? "", /Memory problems are discovered by running/);
  assert.equal(bundle.tasks[0]?.assigneeType, "agent");
  assert.equal(bundle.viewpoints[0]?.topic, "agent memory");
});

test("buildDerivedEvaluation extracts conflicting outreach viewpoints as separate claims", () => {
  const bundle = buildDerivedEvaluation({
    capture: {
      captureId: "cap_2",
      canonicalUrl: "https://x.com/test/status/2",
      platform: "x",
      titleHint: "Outbound strategy"
    },
    document: {
      markdown:
        "---\n---\n# Outbound strategy\n\n## Extracted Content\nStop overthinking and just blast 1000 cold emails. You should scale volume before polishing every line. But don't torch your reputation with sloppy targeting."
    }
  });

  assert.equal(bundle.tags[0]?.slug, "cold-outreach");
  assert.ok(bundle.viewpoints.length >= 1);
  assert.match(bundle.viewpoints[0]?.claim ?? "", /blast 1000 cold emails|don\'t torch your reputation/i);
});

test("task and skill dedupe keys are stable", () => {
  assert.equal(
    normalizeTaskKey({ assigneeType: "agent", tagSlug: "agent-memory", title: "Turn on hybrid search" }),
    normalizeTaskKey({ assigneeType: "agent", tagSlug: "agent-memory", title: "Turn on hybrid search" })
  );

  assert.equal(
    normalizeSkillKey({ targetSystem: "agents_md", tagSlug: "agent-memory", title: "Refine memory guidance" }),
    "agents-md-agent-memory-refine-memory-guidance"
  );
  assert.equal(
    normalizeResourceKey({ resourceUrl: "https://github.com/acme/repo" }),
    "https-github-com-acme-repo"
  );
});

test("topicConflictKey groups conflicting claims by topic", () => {
  assert.equal(
    topicConflictKey("cold-outreach", "Stop overthinking and just blast 1000 cold emails."),
    "cold-outreach-stop-overthinking-and-just-blast-1000-cold-emails"
  );
});

test("buildDerivedEvaluation files standalone tools as resources", () => {
  const bundle = buildDerivedEvaluation({
    capture: {
      captureId: "cap_3",
      canonicalUrl: "https://github.com/openclaw/hybrid-search",
      platform: "web",
      titleHint: "OpenClaw Hybrid Search",
      rawPayload: {}
    },
    document: {
      markdown: "---\n---\n# OpenClaw Hybrid Search\n\n## Extracted Content\nA GitHub repo for hybrid search and temporal decay memory."
    }
  });

  assert.equal(bundle.resources.length, 1);
  assert.equal(bundle.resources[0]?.resourceType, "github");
  assert.equal(bundle.resources[0]?.resourceUrl, "https://github.com/openclaw/hybrid-search");
});

test("buildDerivedEvaluation can produce both playbook outputs and resources", () => {
  const bundle = buildDerivedEvaluation({
    capture: {
      captureId: "cap_4",
      canonicalUrl: "https://x.com/test/status/4",
      platform: "x",
      titleHint: "Outbound stack",
      rawPayload: {
        external_links: [
          {
            url: "https://github.com/acme/cold-outreach",
            title: "acme/cold-outreach"
          }
        ]
      }
    },
    document: {
      markdown:
        "---\n---\n# Outbound stack\n\n## Extracted Content\nStop overthinking and just blast 1000 cold emails, but use the acme/cold-outreach repo to keep targeting tight."
    }
  });

  assert.ok(bundle.tasks.length >= 1);
  assert.ok(bundle.viewpoints.length >= 1);
  assert.ok(bundle.resources.length >= 1);
});
