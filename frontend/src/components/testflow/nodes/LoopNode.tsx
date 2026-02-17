import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Typography, Chip } from "@mui/material";
import { Loop } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { nodeStatusStyles } from "./shared";

export default function LoopNode({ data, selected }: NodeProps) {
  const { t } = useTranslation();
  const d = data as Record<string, unknown>;
  const config = (d.config ?? {}) as Record<string, unknown>;
  const runStatus = d._runStatus as string | undefined;
  const animating = d._animating as boolean | undefined;
  const mode = (config.mode as string) || "count";
  const count = (config.count as number) ?? 3;
  const iterations = d._iterationsCompleted as number | undefined;

  return (
    <Box sx={{ ...nodeStatusStyles(runStatus, selected, "#06b6d4", animating), minWidth: 160 }}>
      <Handle type="target" position={Position.Top} />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1 }}>
        <Loop sx={{ fontSize: 16, color: "#06b6d4" }} />
        <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1 }}>
          {(d.label as string) || "Loop"}
        </Typography>
        <Chip
          label={iterations !== undefined ? `${iterations}/${count}` : mode === "count" ? `x${count}` : "?"}
          size="small"
          sx={{ fontSize: "0.65rem", height: 18 }}
        />
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", px: 1, pb: 0.5 }}>
        <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "#06b6d4" }}>
          {t("testFlow.nodeConfig.loopBody")}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "#8b949e" }}>
          {t("testFlow.nodeConfig.loopDone")}
        </Typography>
      </Box>
      <Handle type="source" position={Position.Bottom} id="source-loop" style={{ left: "30%" }} />
      <Handle type="source" position={Position.Bottom} id="source-done" style={{ left: "70%" }} />
    </Box>
  );
}
