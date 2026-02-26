/**
 * Local proxy execution channels for browser extension and Electron desktop app.
 * These bypass the server-side HTTP proxy, executing requests directly from
 * the user's machine to reach internal/private APIs.
 */

import { safeRandomUUID } from "@/utils/uuid";

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
  body_type?: string | null;
  form_data?: {
    key: string;
    value: string;
    type: string;
    enabled: boolean;
    file_name?: string | null;
    file_content_base64?: string | null;
  }[];
  query_params?: Record<string, string>;
}

function hasContentTypeHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((h) => h.toLowerCase() === "content-type");
}

function ensureContentType(headers: Record<string, string>, contentType: string, force = false): Record<string, string> {
  if (!force && hasContentTypeHeader(headers)) {
    return headers;
  }
  return { ...headers, "Content-Type": contentType };
}

function normalizeLocalRequest(request: LocalProxyRequest): Omit<LocalProxyRequest, "form_data"> & { form_data?: never } {
  const bodyType = (request.body_type || "").toLowerCase();
  const hasBody = request.body !== undefined && request.body !== null && String(request.body) !== "";
  const formData = request.form_data?.filter((item) => item.enabled && item.key);

  let body = request.body;
  let headers = request.headers;

  if (!hasBody && formData && formData.length > 0) {
    const hasFile = formData.some((item) => item.type === "file");
    if (hasFile) {
      throw new Error("Local proxy does not support file upload form-data. Switch to server mode.");
    }

    if (bodyType === "x-www-form-urlencoded" || bodyType === "form-data") {
      const params = new URLSearchParams();
      for (const item of formData) {
        params.append(item.key, item.value || "");
      }
      body = params.toString();
      headers = ensureContentType(headers, "application/x-www-form-urlencoded", true);
    } else if (bodyType === "json") {
      const payload: Record<string, string> = {};
      for (const item of formData) {
        payload[item.key] = item.value || "";
      }
      body = JSON.stringify(payload);
      headers = ensureContentType(headers, "application/json");
    } else {
      // Fallback: treat as x-www-form-urlencoded for compatibility with Slim/PHP login endpoint
      const params = new URLSearchParams();
      for (const item of formData) {
        params.append(item.key, item.value || "");
      }
      body = params.toString();
      headers = ensureContentType(headers, "application/x-www-form-urlencoded", true);
    }
  }

  return {
    url: request.url,
    method: request.method,
    headers,
    body,
    body_type: request.body_type,
    query_params: request.query_params,
  };
}

/**
 * Execute an HTTP request via the Chrome extension's background service worker.
 * Communication: page â†’ postMessage â†’ content.js â†’ chrome.runtime â†’ background.js (fetch)
 */
export function executeViaExtension(request: LocalProxyRequest): Promise<LocalHttpResult> {
  return new Promise((resolve, reject) => {
    let normalized: ReturnType<typeof normalizeLocalRequest>;
    try {
      normalized = normalizeLocalRequest(request);
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Local request normalization failed"));
      return;
    }

    const requestId = safeRandomUUID();
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
        request: normalized,
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

  const normalized = normalizeLocalRequest(request);
  return api.localProxy(normalized);
}

/**
 * Execute via WebSocket through the extension.
 */
export function wsConnectViaExtension(url: string, headers?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = safeRandomUUID();
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
