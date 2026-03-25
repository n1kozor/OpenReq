import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "openreq-learning-mode";

export function useLearningMode() {
  const [learningMode, setLearningModeState] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  );

  const setLearningMode = useCallback((enabled: boolean) => {
    setLearningModeState(enabled);
    localStorage.setItem(STORAGE_KEY, String(enabled));
    // Notify other hook instances in the same tab
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: String(enabled) }));
  }, []);

  const toggleLearningMode = useCallback(() => {
    setLearningMode(!learningMode);
  }, [learningMode, setLearningMode]);

  // Sync across components and tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setLearningModeState(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return { learningMode, setLearningMode, toggleLearningMode };
}
