const ext = globalThis.browser ?? globalThis.chrome;

const SETTINGS_KEY = "knowledgeInboxSettings";
const RETRY_QUEUE_KEY = "knowledgeInboxRetryQueue";
const LAST_STATUS_KEY = "knowledgeInboxLastStatus";
const RETRY_ALARM = "knowledgeInboxRetryAlarm";

const DEFAULT_SETTINGS = {
  apiBaseUrl: "",
  token: "",
  deviceId: "",
  sourceApp: detectSourceApp()
};

ext.runtime.onInstalled.addListener(async () => {
  await ext.alarms.create(RETRY_ALARM, { periodInMinutes: 5 });
});

ext.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== RETRY_ALARM) return;
  await flushRetryQueue();
});

ext.commands.onCommand.addListener(async (command) => {
  if (command === "capture-current-tab") {
    await captureCurrentTab();
    return;
  }

  if (command === "capture-window-tabs") {
    await captureWindowTabs();
  }
});

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((response) => sendResponse({ ok: true, ...response }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "CAPTURE_CURRENT_TAB":
      return await captureCurrentTab();
    case "CAPTURE_SELECTED_TABS":
      return await captureSelectedTabs();
    case "CAPTURE_WINDOW_TABS":
      return await captureWindowTabs();
    case "CAPTURE_ALL_TABS":
      return await captureAllTabs();
    case "FLUSH_RETRY_QUEUE":
      return await flushRetryQueue();
    case "GET_LAST_STATUS":
      return { data: await getLastStatus() };
    default:
      throw new Error("Unknown message type");
  }
}

async function captureCurrentTab() {
  const tabs = await ext.tabs.query({ active: true, currentWindow: true });
  return await captureTabs(tabs, "single_tab");
}

async function captureSelectedTabs() {
  let tabs = await ext.tabs.query({ highlighted: true, currentWindow: true });
  if (!tabs.length) {
    tabs = await ext.tabs.query({ active: true, currentWindow: true });
  }
  return await captureTabs(tabs, "selected_tabs");
}

async function captureWindowTabs() {
  const tabs = await ext.tabs.query({ currentWindow: true });
  return await captureTabs(tabs, "window_tabs");
}

async function captureAllTabs() {
  const tabs = await ext.tabs.query({});
  return await captureTabs(tabs, "all_tabs");
}

async function captureTabs(tabs, captureMethod) {
  const settings = await getSettings();
  ensureConfigured(settings);

  const batch = buildCaptureBatch(tabs, captureMethod, settings.sourceApp);
  const { requests } = batch;

  if (!requests.length) {
    await setLastStatus({
      status: "no_capturable_tabs",
      captureMethod,
      requested: batch.requested,
      skipped_unsupported: batch.skippedUnsupported,
      skipped_duplicate_urls: batch.skippedDuplicateUrls,
      timestamp: Date.now()
    });
    throw new Error("No capturable tabs found in the selected set.");
  }

  try {
    const result = await sendCaptureRequests(settings, requests);
    const acceptedCount = typeof result.accepted === "number" ? result.accepted : result.accepted ? 1 : 0;
    const dedupedCount = typeof result.deduped === "number" ? result.deduped : result.deduped ? 1 : 0;
    const status = {
      status: "success",
      captureMethod,
      requested: batch.requested,
      sent: requests.length,
      accepted: acceptedCount,
      deduped: dedupedCount,
      skipped_unsupported: batch.skippedUnsupported,
      skipped_duplicate_urls: batch.skippedDuplicateUrls,
      timestamp: Date.now()
    };
    await setLastStatus(status);

    return status;
  } catch (error) {
    const errorMessage = error.message || String(error);
    await enqueueRetry({
      requests,
      captureMethod,
      requested: batch.requested,
      skippedUnsupported: batch.skippedUnsupported,
      skippedDuplicateUrls: batch.skippedDuplicateUrls,
      reason: errorMessage,
      attempts: 0
    });
    const status = {
      status: "queued_for_retry",
      captureMethod,
      requested: batch.requested,
      queued: requests.length,
      skipped_unsupported: batch.skippedUnsupported,
      skipped_duplicate_urls: batch.skippedDuplicateUrls,
      error: errorMessage,
      timestamp: Date.now()
    };
    await setLastStatus(status);

    throw new Error(`Send failed. Queued ${requests.length} item(s) for retry.`);
  }
}

function buildCaptureBatch(tabs, captureMethod, sourceApp) {
  const requests = [];
  const seenUrls = new Set();
  let skippedUnsupported = 0;
  let skippedDuplicateUrls = 0;

  for (const tab of tabs) {
    const url = typeof tab?.url === "string" ? tab.url : "";
    if (!/^https?:\/\//i.test(url)) {
      skippedUnsupported += 1;
      continue;
    }

    if (seenUrls.has(url)) {
      skippedDuplicateUrls += 1;
      continue;
    }

    seenUrls.add(url);
    requests.push(toCaptureRequest(tab, captureMethod, sourceApp));
  }

  return {
    requests,
    requested: tabs.length,
    skippedUnsupported,
    skippedDuplicateUrls
  };
}

function toCaptureRequest(tab, captureMethod, sourceApp) {
  return {
    source_url: tab.url,
    captured_at: Date.now(),
    capture_method: captureMethod,
    source_app: sourceApp,
    title_hint: tab.title || undefined,
    tab_context: `window:${tab.windowId} index:${tab.index}`,
    source_metadata: {
      tab_id: tab.id,
      window_id: tab.windowId,
      index: tab.index,
      pinned: Boolean(tab.pinned),
      audible: Boolean(tab.audible),
      fav_icon_url: tab.favIconUrl || null
    }
  };
}

async function sendCaptureRequests(settings, requests) {
  const isBulk = requests.length > 1;
  const endpoint = new URL(isBulk ? "/v1/captures/bulk" : "/v1/captures", settings.apiBaseUrl);

  const payload = isBulk ? { requests } : requests[0];

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.token}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return await response.json();
}

async function enqueueRetry(item) {
  const queue = await getRetryQueue();
  queue.push({ ...item, queuedAt: Date.now() });
  await ext.storage.local.set({ [RETRY_QUEUE_KEY]: queue });
}

async function getRetryQueue() {
  const data = await ext.storage.local.get(RETRY_QUEUE_KEY);
  return Array.isArray(data[RETRY_QUEUE_KEY]) ? data[RETRY_QUEUE_KEY] : [];
}

async function flushRetryQueue() {
  const settings = await getSettings();
  ensureConfigured(settings);

  const queue = await getRetryQueue();
  if (!queue.length) {
    const status = {
      status: "retry_complete",
      retried_batches: 0,
      retried_items: 0,
      remaining_batches: 0,
      remaining_items: 0,
      timestamp: Date.now()
    };
    await setLastStatus(status);
    return status;
  }

  const remaining = [];
  let retriedBatches = 0;
  let retriedItems = 0;

  for (const item of queue) {
    try {
      await sendCaptureRequests(settings, item.requests);
      retriedBatches += 1;
      retriedItems += item.requests.length;
    } catch (error) {
      const attempts = (item.attempts || 0) + 1;
      if (attempts < 10) {
        remaining.push({ ...item, attempts, reason: error.message || String(error) });
      }
    }
  }

  const remainingItems = remaining.reduce((sum, entry) => sum + entry.requests.length, 0);
  await ext.storage.local.set({ [RETRY_QUEUE_KEY]: remaining });
  await setLastStatus({
    status: "retry_complete",
    retried_batches: retriedBatches,
    retried_items: retriedItems,
    remaining_batches: remaining.length,
    remaining_items: remainingItems,
    timestamp: Date.now()
  });

  return {
    status: "retry_complete",
    retried_batches: retriedBatches,
    retried_items: retriedItems,
    remaining_batches: remaining.length,
    remaining_items: remainingItems,
    timestamp: Date.now()
  };
}

async function getSettings() {
  const data = await ext.storage.local.get(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(data[SETTINGS_KEY] || {})
  };
}

function ensureConfigured(settings) {
  if (!settings.apiBaseUrl || !settings.token) {
    throw new Error("Set API base URL and device token in extension options first.");
  }
}

async function setLastStatus(status) {
  await ext.storage.local.set({ [LAST_STATUS_KEY]: status });
}

async function getLastStatus() {
  const data = await ext.storage.local.get(LAST_STATUS_KEY);
  return data[LAST_STATUS_KEY] || null;
}

function detectSourceApp() {
  const ua = navigator.userAgent || "";
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) {
    return "safari_extension";
  }

  return "chrome_extension";
}
