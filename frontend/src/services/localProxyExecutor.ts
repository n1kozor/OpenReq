/**
 * Local proxy execution channels for browser extension and Electron desktop app.
 * These bypass the server-side HTTP proxy, executing requests directly from
 * the user's machine to reach internal/private APIs.
 */

export interface LocalHttpResult {
  status_code: number;
  headers: Record<string, string>;
  body: string;
  body_base64?: string | null;
  is_binary: boolean;
  content_type: string;
  elapsed_ms: number;
  size_bytes: number;
}

export interface LocalProxyRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string | null;
  query_params?: Record<string, string>;
}

/**
 * Execute an HTTP request via the Chrome extension's background service worker.
 * Communication: page → postMessage → content.js → chrome.runtime → background.js (fetch)
 */
export function executeViaExtension(request: LocalProxyRequest): Promise<LocalHttpResult> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    let settled = false;

    const handler = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type !== "OPENREQ_PROXY_RESPONSE") return;
      if (event.data.requestId !== requestId) return;

      settled = true;
      window.removeEventListener("message", handler);

      if (event.data.error) {
        reject(new Error(event.data.error));
      } else {
        resolve(event.data.response as LocalHttpResult);
      }
    };

    window.addEventListener("message", handler);

    // Timeout after 120 seconds
    setTimeout(() => {
      if (!settled) {
        settled = true;
        window.removeEventListener("message", handler);
        reject(new Error("Extension proxy request timed out (120s)"));
      }
    }, 120_000);

    window.postMessage(
      {
        type: "OPENREQ_PROXY_REQUEST",
        requestId,
        request,
      },
      "*",
    );
  });
}

/**
 * Execute an HTTP request via Electron's IPC bridge (Node.js http/https).
 */
export async function executeViaDesktop(request: LocalProxyRequest): Promise<LocalHttpResult> {
  const api = (window as any).electronAPI;
  if (!api?.localProxy) {
    throw new Error("Desktop local proxy not available");
  }
  return api.localProxy(request);
}

/**
 * Execute via WebSocket through the extension.
 */
export function wsConnectViaExtension(url: string, headers?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const handler = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type !== "OPENREQ_WS_CONNECTED" || event.data.requestId !== requestId) return;
      window.removeEventListener("message", handler);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve();
    };
    window.addEventListener("message", handler);
    setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("WebSocket connection timed out"));
    }, 10_000);
    window.postMessage({ type: "OPENREQ_WS_CONNECT", requestId, url, headers }, "*");
  });
}

export function wsSendViaExtension(data: string): void {
  window.postMessage({ type: "OPENREQ_WS_SEND", data }, "*");
}

export function wsDisconnectViaExtension(): void {
  window.postMessage({ type: "OPENREQ_WS_DISCONNECT" }, "*");
}
