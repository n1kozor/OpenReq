import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { ProxyMode } from "@/types";

const STORAGE_KEY = "openreq-proxy-mode";
const IS_STANDALONE = import.meta.env.VITE_STANDALONE === "true";

export type LocalChannel = "extension" | "desktop" | null;

interface ProxyModeContextValue {
  proxyMode: ProxyMode;
  setProxyMode: (mode: ProxyMode) => void;
  /** Whether any local channel (extension or desktop) is available */
  localAvailable: boolean;
  /** Which underlying channel is active: extension, desktop, or null */
  localChannel: LocalChannel;
  extensionAvailable: boolean;
  desktopAvailable: boolean;
}

export const ProxyModeContext = createContext<ProxyModeContextValue>({
  proxyMode: "server",
  setProxyMode: () => {},
  localAvailable: false,
  localChannel: null,
  extensionAvailable: false,
  desktopAvailable: false,
});

export function useProxyModeProvider(): ProxyModeContextValue {
  // Synchronous initial check (preload scripts run before React mounts)
  const [extensionAvailable, setExtensionAvailable] = useState(
    () => !!(window as any).__OPENREQ_EXTENSION__,
  );
  const [desktopAvailable, setDesktopAvailable] = useState(
    () => !!(window as any).electronAPI?.localProxy,
  );
  // Track whether async detection has completed (avoid premature fallback)
  const [detectionDone, setDetectionDone] = useState(false);

  useEffect(() => {
    const checkExtension = () => {
      setExtensionAvailable(!!(window as any).__OPENREQ_EXTENSION__);
    };
    checkExtension();
    const handler = () => checkExtension();
    window.addEventListener("openreq-extension-ready", handler);
    const timer = setTimeout(() => {
      checkExtension();
      setDetectionDone(true);
    }, 2500);
    return () => {
      window.removeEventListener("openreq-extension-ready", handler);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const checkDesktop = () => {
      const available = !!(window as any).electronAPI?.localProxy;
      setDesktopAvailable(available);
      if (available) setDetectionDone(true);
    };
    checkDesktop();
    window.addEventListener("openreq-desktop-ready", checkDesktop);
    const timer = setTimeout(() => {
      checkDesktop();
      setDetectionDone(true);
    }, 2000);
    return () => {
      window.removeEventListener("openreq-desktop-ready", checkDesktop);
      clearTimeout(timer);
    };
  }, []);

  const localAvailable = extensionAvailable || desktopAvailable;

  // Desktop takes priority over extension (Node.js http is more capable than fetch)
  const localChannel = useMemo<LocalChannel>(() => {
    if (desktopAvailable) return "desktop";
    if (extensionAvailable) return "extension";
    return null;
  }, [extensionAvailable, desktopAvailable]);

  const [proxyMode, setProxyModeState] = useState<ProxyMode>(() => {
    // Standalone always defaults to local — it runs its own backend,
    // so requests should go directly from the desktop app
    if (IS_STANDALONE) return "local";
    const saved = localStorage.getItem(STORAGE_KEY) as ProxyMode | null;
    if (saved && ["server", "local"].includes(saved)) return saved;
    // Auto-detect: if any local channel available, default to local
    if ((window as any).electronAPI?.localProxy || (window as any).__OPENREQ_EXTENSION__) return "local";
    return "server";
  });

  // Standalone: force local mode whenever desktop channel becomes available
  useEffect(() => {
    if (IS_STANDALONE && desktopAvailable && proxyMode !== "local") {
      setProxyModeState("local");
    }
  }, [desktopAvailable, proxyMode]);

  // Non-standalone: fall back to server ONLY after detection is done and local is truly unavailable
  useEffect(() => {
    if (IS_STANDALONE) return;
    if (!detectionDone) return;
    if (proxyMode === "local" && !localAvailable) setProxyModeState("server");
  }, [proxyMode, localAvailable, detectionDone]);

  const setProxyMode = useCallback((mode: ProxyMode) => {
    // Standalone: don't allow switching away from local when desktop is available
    if (IS_STANDALONE && desktopAvailable && mode !== "local") return;
    setProxyModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [desktopAvailable]);

  return { proxyMode, setProxyMode, localAvailable, localChannel, extensionAvailable, desktopAvailable };
}

export function useProxyMode() {
  return useContext(ProxyModeContext);
}
