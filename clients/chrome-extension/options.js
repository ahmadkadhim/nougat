const ext = globalThis.browser ?? globalThis.chrome;

const SETTINGS_KEY = "knowledgeInboxSettings";
const defaults = {
  apiBaseUrl: "",
  token: "",
  deviceId: "",
  sourceApp: "chrome_extension"
};

const fields = {
  apiBaseUrl: document.getElementById("apiBaseUrl"),
  token: document.getElementById("token"),
  deviceId: document.getElementById("deviceId"),
  sourceApp: document.getElementById("sourceApp"),
  deviceName: document.getElementById("deviceName"),
  platform: document.getElementById("platform")
};

const status = document.getElementById("status");

document.getElementById("save").addEventListener("click", saveSettings);
document.getElementById("register").addEventListener("click", registerDevice);
document.getElementById("rotate").addEventListener("click", rotateToken);

void loadSettings();

async function loadSettings() {
  const data = await ext.storage.local.get(SETTINGS_KEY);
  const settings = { ...defaults, ...(data[SETTINGS_KEY] || {}) };

  fields.apiBaseUrl.value = settings.apiBaseUrl;
  fields.token.value = settings.token;
  fields.deviceId.value = settings.deviceId;
  fields.sourceApp.value = settings.sourceApp;
}

async function saveSettings() {
  const settings = collectSettings();
  await ext.storage.local.set({ [SETTINGS_KEY]: settings });
  setStatus("Settings saved.");
}

async function registerDevice() {
  const apiBaseUrl = fields.apiBaseUrl.value.trim();
  if (!apiBaseUrl) {
    setStatus("API base URL is required before registration.");
    return;
  }

  const payload = {
    name: fields.deviceName.value.trim() || "Browser Extension",
    platform: fields.platform.value.trim() || "browser",
    scopes: ["capture:write"]
  };

  const response = await fetch(new URL("/v1/devices/register", apiBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    setStatus(`Registration failed (${response.status}): ${await response.text()}`);
    return;
  }

  const result = await response.json();
  fields.token.value = result.token;
  fields.deviceId.value = result.device_id;

  await saveSettings();
  setStatus(`Registered device ${result.device_id}.`);
}

async function rotateToken() {
  const settings = collectSettings();
  if (!settings.apiBaseUrl || !settings.token) {
    setStatus("API URL and current token are required to rotate.");
    return;
  }

  const response = await fetch(new URL("/v1/devices/rotate-token", settings.apiBaseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.token}`
    },
    body: "{}"
  });

  if (!response.ok) {
    setStatus(`Rotation failed (${response.status}): ${await response.text()}`);
    return;
  }

  const result = await response.json();
  fields.token.value = result.token;
  fields.deviceId.value = result.device_id;
  await saveSettings();
  setStatus(`Token rotated for ${result.device_id}.`);
}

function collectSettings() {
  return {
    apiBaseUrl: fields.apiBaseUrl.value.trim(),
    token: fields.token.value.trim(),
    deviceId: fields.deviceId.value.trim(),
    sourceApp: fields.sourceApp.value.trim() || "chrome_extension"
  };
}

function setStatus(text) {
  status.textContent = text;
}
