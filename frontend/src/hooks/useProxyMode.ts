import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { ProxyMode } from "@/types";

const STORAGE_KEY = "openreq-proxy-mode";

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
    const saved = localStorage.getItem(STORAGE_KEY) as ProxyMode | null;
    if (saved && ["server", "local"].includes(saved)) return saved;
    // Auto-detect: if any local channel available, default to local
    if ((window as any).electronAPI?.localProxy || (window as any).__OPENREQ_EXTENSION__) return "local";
    return "server";
  });

  // Fall back to server ONLY after detection is done and local is truly unavailable
  useEffect(() => {
    if (!detectionDone) return;
    if (proxyMode === "local" && !localAvailable) setProxyModeState("server");
  }, [proxyMode, localAvailable, detectionDone]);

  const setProxyMode = useCallback((mode: ProxyMode) => {
    setProxyModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  return { proxyMode, setProxyMode, localAvailable, localChannel, extensionAvailable, desktopAvailable };
}

export function useProxyMode() {
  return useContext(ProxyModeContext);
}
