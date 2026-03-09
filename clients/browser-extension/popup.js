const ext = globalThis.browser ?? globalThis.chrome;
const statusEl = document.getElementById("status");

document.getElementById("captureCurrent").addEventListener("click", () => run("CAPTURE_CURRENT_TAB"));
document.getElementById("captureSelected").addEventListener("click", () => run("CAPTURE_SELECTED_TABS"));
document.getElementById("captureWindow").addEventListener("click", () => run("CAPTURE_WINDOW_TABS"));
document.getElementById("captureAll").addEventListener("click", () => run("CAPTURE_ALL_TABS"));
document.getElementById("flushQueue").addEventListener("click", () => run("FLUSH_RETRY_QUEUE"));

void refreshStatus();

async function run(type) {
  setStatus(`Running: ${type}...`);
  const response = await ext.runtime.sendMessage({ type });
  if (!response?.ok) {
    setStatus(`Error: ${response?.error || "Unknown failure"}`);
    return;
  }

  setStatus(formatStatusPayload(response));
}

async function refreshStatus() {
  const response = await ext.runtime.sendMessage({ type: "GET_LAST_STATUS" });
  if (response?.ok && response?.data) {
    setStatus(formatStatusPayload(response.data));
    return;
  }

  setStatus("No status yet.");
}

function setStatus(text) {
  statusEl.textContent = text;
}

function formatStatusPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return "No status yet.";
  }

  const lines = [];

  if (payload.status) {
    lines.push(`Status: ${payload.status}`);
  }

  if (payload.captureMethod) {
    lines.push(`Scope: ${humanizeCaptureMethod(payload.captureMethod)}`);
  }

  if (typeof payload.requested === "number") {
    lines.push(`Tabs considered: ${payload.requested}`);
  }

  if (typeof payload.sent === "number") {
    lines.push(`Sent: ${payload.sent}`);
  }

  if (typeof payload.accepted === "number") {
    lines.push(`Accepted: ${payload.accepted}`);
  }

  if (typeof payload.deduped === "number") {
    lines.push(`Server deduped: ${payload.deduped}`);
  }

  if (typeof payload.queued === "number") {
    lines.push(`Queued for retry: ${payload.queued}`);
  }

  if (typeof payload.skipped_unsupported === "number") {
    lines.push(`Skipped non-web tabs: ${payload.skipped_unsupported}`);
  }

  if (typeof payload.skipped_duplicate_urls === "number") {
    lines.push(`Skipped duplicate URLs: ${payload.skipped_duplicate_urls}`);
  }

  if (typeof payload.retried_items === "number") {
    lines.push(`Retried items: ${payload.retried_items}`);
  }

  if (typeof payload.remaining_items === "number") {
    lines.push(`Remaining queued items: ${payload.remaining_items}`);
  }

  if (payload.error) {
    lines.push(`Error: ${payload.error}`);
  }

  if (typeof payload.timestamp === "number") {
    lines.push(`Updated: ${new Date(payload.timestamp).toLocaleString()}`);
  }

  return lines.join("\n");
}

function humanizeCaptureMethod(captureMethod) {
  switch (captureMethod) {
    case "single_tab":
      return "Current tab";
    case "selected_tabs":
      return "Selected tabs";
    case "window_tabs":
      return "Current window";
    case "all_tabs":
      return "All open tabs";
    default:
      return captureMethod;
  }
}
