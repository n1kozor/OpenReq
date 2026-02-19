/**
 * OpenReq Local Proxy — Background Service Worker (Manifest V3)
 *
 * Handles HTTP requests via fetch() (no CORS restrictions in extensions)
 * and WebSocket connections for the local proxy feature.
 */

const BINARY_PREFIXES = [
  "image/", "audio/", "video/", "font/",
  "application/pdf", "application/zip", "application/gzip",
  "application/x-tar", "application/x-7z-compressed",
  "application/x-rar-compressed", "application/octet-stream",
  "application/vnd.ms-excel", "application/vnd.openxmlformats",
  "application/msword", "application/x-bzip2",
  "application/wasm", "application/protobuf",
];

function isBinaryContentType(ct) {
  const lower = (ct || "").toLowerCase().split(";")[0].trim();
  return BINARY_PREFIXES.some((p) => lower.startsWith(p));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── HTTP Proxy ──
async function handleProxyRequest({ url, method, headers, body, query_params }) {
  // Append query params
  const urlObj = new URL(url);
  if (query_params) {
    for (const [k, v] of Object.entries(query_params)) {
      urlObj.searchParams.set(k, v);
    }
  }

  const fetchOptions = {
    method: method || "GET",
    headers: headers || {},
    redirect: "follow",
  };

  // Only set body for methods that support it
  if (body && !["GET", "HEAD"].includes((method || "GET").toUpperCase())) {
    fetchOptions.body = body;
  }

  const startTime = performance.now();

  try {
    const resp = await fetch(urlObj.toString(), fetchOptions);
    const elapsed = performance.now() - startTime;

    const respHeaders = {};
    resp.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });

    const contentType = resp.headers.get("content-type") || "";
    const isBinary = isBinaryContentType(contentType);
    const buffer = await resp.arrayBuffer();
    const sizeBytes = buffer.byteLength;

    let responseBody = "";
    let bodyBase64 = null;

    if (isBinary) {
      bodyBase64 = arrayBufferToBase64(buffer);
    } else {
      responseBody = new TextDecoder().decode(buffer);
    }

    return {
      status_code: resp.status,
      headers: respHeaders,
      body: responseBody,
      body_base64: bodyBase64,
      is_binary: isBinary,
      content_type: contentType,
      elapsed_ms: Math.round(elapsed * 100) / 100,
      size_bytes: sizeBytes,
    };
  } catch (err) {
    return { error: `Local request failed: ${err.message}` };
  }
}

// ── WebSocket Proxy ──
let activeWs = null;
let activeWsSender = null; // tab ID for forwarding messages

function handleWsConnect(url, headers, senderTabId) {
  // Close existing connection if any
  if (activeWs) {
    try { activeWs.close(); } catch { /* ignore */ }
    activeWs = null;
  }

  activeWsSender = senderTabId;

  try {
    activeWs = new WebSocket(url);

    activeWs.onopen = () => {
      // Connected — no explicit message needed, the sendResponse already ack'd
    };

    activeWs.onmessage = (event) => {
      if (activeWsSender) {
        chrome.tabs.sendMessage(activeWsSender, {
          type: "WS_MESSAGE",
          data: typeof event.data === "string" ? event.data : String(event.data),
        });
      }
    };

    activeWs.onerror = (event) => {
      if (activeWsSender) {
        chrome.tabs.sendMessage(activeWsSender, {
          type: "WS_ERROR",
          error: "WebSocket error occurred",
        });
      }
    };

    activeWs.onclose = () => {
      if (activeWsSender) {
        chrome.tabs.sendMessage(activeWsSender, { type: "WS_CLOSED" });
      }
      activeWs = null;
      activeWsSender = null;
    };

    return {};
  } catch (err) {
    return { error: err.message };
  }
}

// ── Message Listener ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PROXY_REQUEST") {
    handleProxyRequest(message.request).then(sendResponse);
    return true; // async response
  }

  if (message.type === "WS_CONNECT") {
    const result = handleWsConnect(message.url, message.headers, sender.tab?.id);
    sendResponse(result);
    return false;
  }

  if (message.type === "WS_SEND") {
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(message.data);
    }
    return false;
  }

  if (message.type === "WS_DISCONNECT") {
    if (activeWs) {
      activeWs.close();
      activeWs = null;
      activeWsSender = null;
    }
    return false;
  }

  // Status check from popup
  if (message.type === "GET_STATUS") {
    sendResponse({
      wsConnected: activeWs !== null && activeWs.readyState === WebSocket.OPEN,
    });
    return false;
  }
});
