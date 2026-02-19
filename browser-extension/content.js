/**
 * OpenReq Local Proxy — Content Script
 *
 * Injected into all pages. Sets a marker so the OpenReq frontend knows the
 * extension is available, and bridges postMessage <-> chrome.runtime for
 * HTTP and WebSocket proxy requests.
 */

// The marker (window.__OPENREQ_EXTENSION__) is set by inject.js
// which runs in the MAIN world via manifest "world": "MAIN".

// ── HTTP proxy bridge ──
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data?.type === "OPENREQ_PROXY_REQUEST") {
    const { requestId, request } = event.data;
    chrome.runtime.sendMessage(
      { type: "PROXY_REQUEST", request },
      (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage(
            {
              type: "OPENREQ_PROXY_RESPONSE",
              requestId,
              error: chrome.runtime.lastError.message,
            },
            "*",
          );
          return;
        }
        if (response?.error) {
          window.postMessage(
            { type: "OPENREQ_PROXY_RESPONSE", requestId, error: response.error },
            "*",
          );
        } else {
          window.postMessage(
            { type: "OPENREQ_PROXY_RESPONSE", requestId, response: response },
            "*",
          );
        }
      },
    );
  }

  // ── WebSocket proxy bridge ──
  if (event.data?.type === "OPENREQ_WS_CONNECT") {
    const { requestId, url, headers } = event.data;
    chrome.runtime.sendMessage(
      { type: "WS_CONNECT", url, headers, requestId },
      (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage(
            { type: "OPENREQ_WS_CONNECTED", requestId, error: chrome.runtime.lastError.message },
            "*",
          );
          return;
        }
        window.postMessage(
          { type: "OPENREQ_WS_CONNECTED", requestId, ...(response?.error ? { error: response.error } : {}) },
          "*",
        );
      },
    );
  }

  if (event.data?.type === "OPENREQ_WS_SEND") {
    chrome.runtime.sendMessage({ type: "WS_SEND", data: event.data.data });
  }

  if (event.data?.type === "OPENREQ_WS_DISCONNECT") {
    chrome.runtime.sendMessage({ type: "WS_DISCONNECT" });
  }
});

// Receive WebSocket messages forwarded from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "WS_MESSAGE") {
    window.postMessage(
      { type: "OPENREQ_WS_MESSAGE", data: message.data, direction: "received" },
      "*",
    );
  }
  if (message.type === "WS_ERROR") {
    window.postMessage(
      { type: "OPENREQ_WS_ERROR", error: message.error },
      "*",
    );
  }
  if (message.type === "WS_CLOSED") {
    window.postMessage({ type: "OPENREQ_WS_CLOSED" }, "*");
  }
});
