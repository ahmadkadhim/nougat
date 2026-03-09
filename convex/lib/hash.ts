function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(hash));
}

export async function createCaptureHash(input: {
  canonicalUrl: string;
  selectedText?: string;
  titleHint?: string;
}): Promise<string> {
  const base = [input.canonicalUrl, input.selectedText ?? "", input.titleHint ?? ""].join("||");
  return sha256Hex(base);
}

export async function createContentHash(content: string): Promise<string> {
  return sha256Hex(content.trim());
}

export function randomToken(prefix = "tok"): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${prefix}_${body}`;
}
