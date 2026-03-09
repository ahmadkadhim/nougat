function yamlValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => yamlValue(v)).join(", ")}]`;
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  const escaped = String(value).replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function toFrontmatter(data: Record<string, unknown>): string {
  const lines = Object.entries(data).map(([key, value]) => `${key}: ${yamlValue(value)}`);
  return ["---", ...lines, "---"].join("\n");
}

export function renderMarkdownDocument(input: {
  frontmatter: Record<string, unknown>;
  title?: string;
  summary?: string;
  body?: string;
  sourceUrl: string;
}): string {
  const sections: string[] = [];
  sections.push(toFrontmatter(input.frontmatter));
  sections.push("");
  sections.push(`# ${input.title?.trim() || "Untitled Capture"}`);
  sections.push("");
  sections.push(`Source: ${input.sourceUrl}`);

  if (input.summary) {
    sections.push("");
    sections.push("## Summary");
    sections.push(input.summary.trim());
  }

  if (input.body) {
    sections.push("");
    sections.push("## Extracted Content");
    sections.push(input.body.trim());
  }

  return sections.join("\n").trim() + "\n";
}
