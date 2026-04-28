import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ProxyMode } from "@/types";

const STORAGE_KEY = "openreq-proxy-mode";
const IS_STANDALONE = import.meta.env.VITE_STANDALONE === "true";

const EXTENSION_DETECTION_TIMEOUT_MS = 2500;
const DESKTOP_DETECTION_TIMEOUT_MS = 2000;

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
  /** True until both extension and desktop probes have completed (or timed out) */
  detectionComplete: boolean;
}

export const ProxyModeContext = createContext<ProxyModeContextValue>({
  proxyMode: "server",
  setProxyMode: () => {},
  localAvailable: false,
  localChannel: null,
  extensionAvailable: false,
  desktopAvailable: false,
  detectionComplete: false,
});

function readWindowExtension(): boolean {
  return !!(window as any).__OPENREQ_EXTENSION__;
}

function readWindowDesktop(): boolean {
  return !!(window as any).electronAPI?.localProxy;
}

export function useProxyModeProvider(): ProxyModeContextValue {
  // Synchronous initial check (preload scripts run before React mounts)
  const [extensionAvailable, setExtensionAvailable] = useState(readWindowExtension);
  const [desktopAvailable, setDesktopAvailable] = useState(readWindowDesktop);
  // Per-channel detection completion — fallback to "server" only fires when BOTH probes done
  const [extensionDetectionDone, setExtensionDetectionDone] = useState(readWindowExtension);
  const [desktopDetectionDone, setDesktopDetectionDone] = useState(readWindowDesktop);

  useEffect(() => {
    if (extensionAvailable) {
      setExtensionDetectionDone(true);
      return;
    }
    const handler = () => {
      setExtensionAvailable(readWindowExtension());
      setExtensionDetectionDone(true);
    };
    window.addEventListener("openreq-extension-ready", handler);
    const timer = setTimeout(() => {
      setExtensionAvailable(readWindowExtension());
      setExtensionDetectionDone(true);
    }, EXTENSION_DETECTION_TIMEOUT_MS);
    return () => {
      window.removeEventListener("openreq-extension-ready", handler);
      clearTimeout(timer);
    };
  }, [extensionAvailable]);

  useEffect(() => {
    if (desktopAvailable) {
      setDesktopDetectionDone(true);
      return;
    }
    const handler = () => {
      setDesktopAvailable(readWindowDesktop());
      setDesktopDetectionDone(true);
    };
    window.addEventListener("openreq-desktop-ready", handler);
    const timer = setTimeout(() => {
      setDesktopAvailable(readWindowDesktop());
      setDesktopDetectionDone(true);
    }, DESKTOP_DETECTION_TIMEOUT_MS);
    return () => {
      window.removeEventListener("openreq-desktop-ready", handler);
      clearTimeout(timer);
    };
  }, [desktopAvailable]);

  const localAvailable = extensionAvailable || desktopAvailable;
  const detectionComplete = extensionDetectionDone && desktopDetectionDone;

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
    if (readWindowDesktop() || readWindowExtension()) return "local";
    return "server";
  });

  // Standalone: force local mode whenever desktop channel becomes available
  useEffect(() => {
    if (IS_STANDALONE && desktopAvailable && proxyMode !== "local") {
      setProxyModeState("local");
    }
  }, [desktopAvailable, proxyMode]);

  // Non-standalone: fall back to server ONLY after BOTH detections finished and local is truly unavailable.
  // This prevents the race where the extension responds at ~2.4s but the timer fires at 2.5s
  // and forces an immediate revert to server before the late "ready" event lands.
  useEffect(() => {
    if (IS_STANDALONE) return;
    if (!detectionComplete) return;
    if (proxyMode === "local" && !localAvailable) setProxyModeState("server");
  }, [proxyMode, localAvailable, detectionComplete]);

  // Cross-tab sync: when another tab changes the mode, mirror it here so all tabs agree.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue == null) return;
      if (e.newValue !== "server" && e.newValue !== "local") return;
      setProxyModeState(e.newValue as ProxyMode);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Toggle lock — prevents rapid double-clicks from creating a torn state between
  // React state and localStorage.
  const transitionLockRef = useRef(false);

  const setProxyMode = useCallback((mode: ProxyMode) => {
    if (transitionLockRef.current) return;
    // Standalone: don't allow switching away from local when desktop is available
    if (IS_STANDALONE && desktopAvailable && mode !== "local") return;
    // Don't allow switching INTO local when no local channel exists — silently no-op,
    // the UI is responsible for explaining why (StatusBar shows error color + tooltip).
    if (mode === "local" && !localAvailable) return;
    transitionLockRef.current = true;
    try {
      setProxyModeState(mode);
      localStorage.setItem(STORAGE_KEY, mode);
    } finally {
      // Release on next tick — long enough to coalesce a burst of clicks,
      // short enough to feel instant.
      setTimeout(() => { transitionLockRef.current = false; }, 50);
    }
  }, [desktopAvailable, localAvailable]);

  return {
    proxyMode,
    setProxyMode,
    localAvailable,
    localChannel,
    extensionAvailable,
    desktopAvailable,
    detectionComplete,
  };
}

export function useProxyMode() {
  return useContext(ProxyModeContext);
}
