/**
 * Safe UUID generator that works in non-secure contexts (HTTP).
 * crypto.randomUUID() is only available in secure contexts (HTTPS / localhost).
 * This fallback uses crypto.getRandomValues() which works everywhere,
 * or falls back to Math.random() as a last resort.
 */
export function safeRandomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: use crypto.getRandomValues (available in all modern browsers, even non-secure)
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Set version 4 and variant 10xx
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  // Last resort fallback
  const rand = Math.random().toString(36).slice(2);
  return `r-${Date.now().toString(36)}-${rand}`;
}
