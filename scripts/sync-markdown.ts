import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const API_BASE = process.env.INBOX_API_URL;
const OPERATOR_KEY = process.env.OPERATOR_API_KEY;
const OWNER_AUTH_USER_ID = process.env.OWNER_AUTH_USER_ID;
const OUTPUT_ROOT = process.env.NOUGAT_DIR ?? path.resolve(process.cwd(), "nougat");

if (!API_BASE) {
  throw new Error("INBOX_API_URL is required");
}

async function main() {
  const pendingCaptures = await fetchPendingCaptureMarkdown(100);
  const pendingKnowledge = OWNER_AUTH_USER_ID ? await fetchPendingKnowledgeMarkdown(100) : [];
  const pendingResources = OWNER_AUTH_USER_ID ? await fetchPendingResourceMarkdown(100) : [];
  const pending = [
    ...pendingCaptures.map((doc) => ({ ...doc, kind: "capture" as const })),
    ...pendingKnowledge.map((doc) => ({ ...doc, kind: "knowledge" as const })),
    ...pendingResources.map((doc) => ({ ...doc, kind: "resource" as const }))
  ];

  if (pending.length === 0) {
    console.log("No pending markdown documents.");
    return;
  }

  console.log(`Found ${pending.length} pending markdown document(s).`);

  for (const doc of pending) {
    const outputPath = normalizeOutputPath(doc.path);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, doc.markdown, "utf8");

    if (doc.kind === "capture") {
      await markCaptureExported(doc.documentId);
    } else if (doc.kind === "knowledge") {
      await markKnowledgeExported(doc.documentId);
    } else {
      await markResourceExported(doc.documentId);
    }
    console.log(`Exported: ${doc.documentId} -> ${outputPath}`);
  }
}

async function fetchPendingCaptureMarkdown(limit: number): Promise<Array<{ documentId: string; path: string; markdown: string }>> {
  const url = new URL("/v1/operator/markdown/pending", API_BASE);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url, {
    headers: {
      ...(OPERATOR_KEY ? { "x-operator-key": OPERATOR_KEY } : {})
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch pending markdown: ${res.status}`);
  }

  const payload = (await res.json()) as {
    documents: Array<{ documentId: string; path: string; markdown: string }>;
  };

  return payload.documents;
}

async function fetchPendingKnowledgeMarkdown(limit: number): Promise<Array<{ documentId: string; path: string; markdown: string }>> {
  const url = new URL("/v1/operator/knowledge-markdown/pending", API_BASE);
  url.searchParams.set("limit", String(limit));
  if (OWNER_AUTH_USER_ID) {
    url.searchParams.set("owner_user_id", OWNER_AUTH_USER_ID);
  }

  const res = await fetch(url, {
    headers: {
      ...(OPERATOR_KEY ? { "x-operator-key": OPERATOR_KEY } : {})
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch pending knowledge markdown: ${res.status}`);
  }

  const payload = (await res.json()) as {
    documents: Array<{ documentId: string; path: string; markdown: string }>;
  };

  return payload.documents.filter((doc) => doc.path && doc.markdown);
}

async function markCaptureExported(documentId: string) {
  const url = new URL(`/v1/operator/markdown/${documentId}/exported`, API_BASE);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(OPERATOR_KEY ? { "x-operator-key": OPERATOR_KEY } : {})
    },
    body: "{}"
  });

  if (!res.ok) {
    throw new Error(`Failed to mark exported for ${documentId}: ${res.status}`);
  }
}

async function markKnowledgeExported(documentId: string) {
  const url = new URL(`/v1/operator/knowledge-markdown/${documentId}/exported`, API_BASE);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(OPERATOR_KEY ? { "x-operator-key": OPERATOR_KEY } : {})
    },
    body: "{}"
  });

  if (!res.ok) {
    throw new Error(`Failed to mark knowledge exported for ${documentId}: ${res.status}`);
  }
}

async function fetchPendingResourceMarkdown(limit: number): Promise<Array<{ documentId: string; path: string; markdown: string }>> {
  const url = new URL("/v1/operator/resource-markdown/pending", API_BASE);
  url.searchParams.set("limit", String(limit));
  if (OWNER_AUTH_USER_ID) {
    url.searchParams.set("owner_user_id", OWNER_AUTH_USER_ID);
  }

  const res = await fetch(url, {
    headers: {
      ...(OPERATOR_KEY ? { "x-operator-key": OPERATOR_KEY } : {})
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch pending resource markdown: ${res.status}`);
  }

  const payload = (await res.json()) as {
    documents: Array<{ documentId: string; path: string; markdown: string }>;
  };

  return payload.documents.filter((doc) => doc.path && doc.markdown);
}

async function markResourceExported(documentId: string) {
  const url = new URL(`/v1/operator/resource-markdown/${documentId}/exported`, API_BASE);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(OPERATOR_KEY ? { "x-operator-key": OPERATOR_KEY } : {})
    },
    body: "{}"
  });

  if (!res.ok) {
    throw new Error(`Failed to mark resource exported for ${documentId}: ${res.status}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function normalizeOutputPath(documentPath: string): string {
  const relative = documentPath.startsWith("resources/")
    ? documentPath
    : documentPath.startsWith("nougat/")
      ? documentPath.slice("nougat/".length)
      : documentPath.split("/").slice(1).join("/") || documentPath;
  return path.resolve(OUTPUT_ROOT, relative);
}
