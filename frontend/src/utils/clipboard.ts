/**
 * Copy text to clipboard with three layers of fallback:
 * 1. Electron native bridge (`electronAPI.writeClipboard`) — works inside the
 *    desktop <webview> where browser clipboard APIs are blocked by default.
 * 2. `navigator.clipboard.writeText` — modern, requires a secure context.
 * 3. `execCommand("copy")` via a hidden textarea — legacy fallback.
 */
export async function copyToClipboard(text: string): Promise<void> {
  const value = String(text ?? "");

  // Electron desktop bridge — synchronous, can't fail silently like the browser APIs
  const electronAPI = (window as any).electronAPI;
  if (electronAPI?.writeClipboard) {
    try {
      const ok = electronAPI.writeClipboard(value);
      if (ok !== false) return;
    } catch {
      // fall through
    }
  }

  // Modern API — works in secure contexts (HTTPS / localhost)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Permission denied or not available — fall through to legacy
    }
  }

  // Legacy fallback — works in HTTP and older browsers
  const textarea = document.createElement("textarea");
  textarea.value = value;
  // Prevent scrolling and visibility
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}
