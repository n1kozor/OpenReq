/**
 * Copy text to clipboard with fallback for non-secure contexts and Electron.
 * 1. Tries navigator.clipboard.writeText (modern, requires secure context)
 * 2. Falls back to execCommand("copy") with a temporary textarea (works everywhere)
 */
export async function copyToClipboard(text: string): Promise<void> {
  // Modern API — works in secure contexts (HTTPS / localhost)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Permission denied or not available — fall through to legacy
    }
  }

  // Legacy fallback — works in HTTP, Electron, and older browsers
  const textarea = document.createElement("textarea");
  textarea.value = text;
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
