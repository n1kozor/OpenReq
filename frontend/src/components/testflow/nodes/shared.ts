import type { SxProps, Theme } from "@mui/material";

export function nodeStatusStyles(
  runStatus: string | undefined,
  selected: boolean | undefined,
  accentColor: string,
): SxProps<Theme> {
  const base: SxProps<Theme> = {
    border: selected ? `2px solid ${accentColor}` : "1px solid rgba(255,255,255,0.12)",
    borderRadius: 2,
    bgcolor: "background.paper",
    transition: "border-color 0.4s ease, box-shadow 0.4s ease, opacity 0.4s ease",
    fontSize: "0.85rem",
  };

  if (runStatus === "running") {
    return {
      ...base,
      borderColor: "#eab308",
      boxShadow: "0 0 16px rgba(234,179,8,0.35)",
      animation: "nodeRunningPulse 1.2s ease-in-out infinite",
    };
  }
  if (runStatus === "success") {
    return {
      ...base,
      borderColor: "#22c55e",
      boxShadow: "0 0 10px rgba(34,197,94,0.2)",
    };
  }
  if (runStatus === "error") {
    return {
      ...base,
      borderColor: "#ef4444",
      boxShadow: "0 0 12px rgba(239,68,68,0.3)",
    };
  }
  if (runStatus === "skipped") {
    return { ...base, borderColor: "#6b7280", borderStyle: "dashed", opacity: 0.5 };
  }
  return base;
}
