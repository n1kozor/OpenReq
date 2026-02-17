import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Typography } from "@mui/material";
import { CallSplit } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { nodeStatusStyles } from "./shared";

export default function ConditionNode({ data, selected }: NodeProps) {
  const { t } = useTranslation();
  const d = data as Record<string, unknown>;
  const config = (d.config ?? {}) as Record<string, unknown>;
  const runStatus = d._runStatus as string | undefined;
  const branchTaken = d._branchTaken as string | undefined;
  const expression = (config.expression as string) || "";

  return (
    <Box
      sx={{
        ...nodeStatusStyles(runStatus, selected, "#ec4899"),
        minWidth: 180,
        position: "relative",
        borderRadius: 2,
        transform: "rotate(0deg)",
      }}
    >
      <Handle type="target" position={Position.Top} />
      <Box sx={{ p: 1, textAlign: "center" }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5, mb: 0.25 }}>
          <CallSplit sx={{ fontSize: 16, color: "#ec4899" }} />
          <Typography variant="body2" fontWeight={600}>
            {(d.label as string) || "Condition"}
          </Typography>
        </Box>
        <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "#ec4899", opacity: 0.7, display: "block" }}>
          {t("testFlow.nodeConfig.conditionSubtitle")}
        </Typography>
        {expression && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", fontSize: "0.65rem", fontFamily: "monospace" }}
            noWrap
          >
            {expression}
          </Typography>
        )}
        {branchTaken && (
          <Typography variant="caption" color={branchTaken === "true" ? "success.main" : "error.main"} fontWeight={700}>
            {branchTaken === "true" ? t("testFlow.nodeConfig.trueBranch") : t("testFlow.nodeConfig.falseBranch")}
          </Typography>
        )}
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", px: 1, pb: 0.5 }}>
        <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "#22c55e" }}>
          {t("testFlow.nodeConfig.trueBranch")}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "#ef4444" }}>
          {t("testFlow.nodeConfig.falseBranch")}
        </Typography>
      </Box>
      <Handle type="source" position={Position.Bottom} id="source-true" style={{ left: "30%" }} />
      <Handle type="source" position={Position.Bottom} id="source-false" style={{ left: "70%" }} />
    </Box>
  );
}
