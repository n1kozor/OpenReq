import { useState, useCallback } from "react";

const STORAGE_KEY = "openreq-learning-mode";

export function useLearningMode() {
  const [learningMode, setLearningModeState] = useState<boolean>(
    () => localStorage.getItem(STORAGE_KEY) === "true"
  );

  const setLearningMode = useCallback((enabled: boolean) => {
    setLearningModeState(enabled);
    localStorage.setItem(STORAGE_KEY, String(enabled));
  }, []);

  const toggleLearningMode = useCallback(() => {
    setLearningMode(!learningMode);
  }, [learningMode, setLearningMode]);

  return { learningMode, setLearningMode, toggleLearningMode };
}
