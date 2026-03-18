const ext = globalThis.browser ?? globalThis.chrome;

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "REQUEST_PAIRING_FROM_PAGE") {
    return undefined;
  }

  requestPairingFromPage(message.payload)
    .then((payload) => sendResponse({ ok: true, payload }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

async function requestPairingFromPage(payload) {
  const requestId = globalThis.crypto?.randomUUID?.() ?? `pair_${Date.now()}`;

  return await new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("No Nougat pairing response arrived from this tab. Open the signed-in dashboard and try again."));
    }, 4000);

    function cleanup() {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
    }

    function handleMessage(event) {
      if (event.source !== window) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== "object" || data.source !== "nougat-app" || data.type !== "NOUGAT_EXTENSION_PAIRING_RESPONSE") {
        return;
      }

      if (data.requestId !== requestId) {
        return;
      }

      cleanup();

      if (data.ok === false) {
        reject(new Error(typeof data.error === "string" ? data.error : "Nougat rejected the pairing request."));
        return;
      }

      resolve(data.payload);
    }

    window.addEventListener("message", handleMessage);
    window.postMessage(
      {
        payload,
        requestId,
        source: "nougat-extension-bridge",
        type: "NOUGAT_EXTENSION_PAIRING_REQUEST"
      },
      window.location.origin
    );
  });
}
