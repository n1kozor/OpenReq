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

const LOCAL_PROXY_TIMEOUT_MS = 120_000;
const WS_CONNECT_TIMEOUT_MS = 30_000;

function abortError(): DOMException {
  return new DOMException("Local proxy request aborted", "AbortError");
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

function resolveFormItemValues(item: { type: string; value: string }): string[] {
  if (item.type !== "list") {
    return [item.value || ""];
  }
  try {
    const parsed = JSON.parse(item.value || "");
    if (Array.isArray(parsed)) {
      return parsed.map((v) => (v == null ? "" : String(v)));
    }
    return [parsed == null ? "" : String(parsed)];
  } catch {
    return [item.value || ""];
  }
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
        for (const value of resolveFormItemValues(item)) {
          params.append(item.key, value);
        }
      }
      body = params.toString();
      headers = ensureContentType(headers, "application/x-www-form-urlencoded", true);
    } else if (bodyType === "json") {
      const payload: Record<string, string> = {};
      for (const item of formData) {
        const values = resolveFormItemValues(item);
        payload[item.key] = values.length === 1 ? values[0] ?? "" : JSON.stringify(values);
      }
      body = JSON.stringify(payload);
      headers = ensureContentType(headers, "application/json");
    } else {
      // Fallback: treat as x-www-form-urlencoded for compatibility with Slim/PHP login endpoint
      const params = new URLSearchParams();
      for (const item of formData) {
        for (const value of resolveFormItemValues(item)) {
          params.append(item.key, value);
        }
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
export function executeViaExtension(request: LocalProxyRequest, signal?: AbortSignal): Promise<LocalHttpResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    let normalized: ReturnType<typeof normalizeLocalRequest>;
    try {
      normalized = normalizeLocalRequest(request);
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Local request normalization failed"));
      return;
    }

    const requestId = safeRandomUUID();
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      window.removeEventListener("message", handler);
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (signal) signal.removeEventListener("abort", onAbort);
    };

    const handler = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type !== "OPENREQ_PROXY_RESPONSE") return;
      if (event.data.requestId !== requestId) return;
      if (settled) return;

      settled = true;
      cleanup();

      if (event.data.error) {
        reject(new Error(event.data.error));
      } else {
        resolve(event.data.response as LocalHttpResult);
      }
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      // Tell the extension to drop the in-flight request if it can.
      try {
        window.postMessage({ type: "OPENREQ_PROXY_ABORT", requestId }, "*");
      } catch { /* ignore */ }
      reject(abortError());
    };

    window.addEventListener("message", handler);
    if (signal) signal.addEventListener("abort", onAbort);

    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Extension proxy request timed out (${Math.round(LOCAL_PROXY_TIMEOUT_MS / 1000)}s)`));
    }, LOCAL_PROXY_TIMEOUT_MS);

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
 *
 * Cancellation note: the underlying IPC call cannot be cancelled from the renderer,
 * but when `signal` aborts we reject the returned promise immediately so the UI
 * stops waiting. Any late response from the desktop process is discarded by the
 * caller because the abort path has already settled this promise.
 */
export function executeViaDesktop(request: LocalProxyRequest, signal?: AbortSignal): Promise<LocalHttpResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const api = (window as any).electronAPI;
    if (!api?.localProxy) {
      reject(new Error("Desktop local proxy not available"));
      return;
    }

    let normalized: ReturnType<typeof normalizeLocalRequest>;
    try {
      normalized = normalizeLocalRequest(request);
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Local request normalization failed"));
      return;
    }

    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    if (signal) signal.addEventListener("abort", onAbort);

    api.localProxy(normalized).then(
      (response: LocalHttpResult) => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve(response);
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener("abort", onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/**
 * Execute via WebSocket through the extension.
 */
export function wsConnectViaExtension(url: string, headers?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = safeRandomUUID();
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      window.removeEventListener("message", handler);
      if (timeoutId !== null) clearTimeout(timeoutId);
    };

    const handler = (event: MessageEvent) => {
      if (event.source !== window) return;
      if (event.data?.type !== "OPENREQ_WS_CONNECTED" || event.data.requestId !== requestId) return;
      if (settled) return;
      settled = true;
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve();
    };
    window.addEventListener("message", handler);
    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`WebSocket connection timed out (${Math.round(WS_CONNECT_TIMEOUT_MS / 1000)}s)`));
    }, WS_CONNECT_TIMEOUT_MS);
    window.postMessage({ type: "OPENREQ_WS_CONNECT", requestId, url, headers }, "*");
  });
}

export function wsSendViaExtension(data: string): void {
  window.postMessage({ type: "OPENREQ_WS_SEND", data }, "*");
}

export function wsDisconnectViaExtension(): void {
  window.postMessage({ type: "OPENREQ_WS_DISCONNECT" }, "*");
}
