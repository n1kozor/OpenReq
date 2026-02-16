import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Typography } from "@mui/material";
import { Timer } from "@mui/icons-material";
import { nodeStatusStyles } from "./shared";

export default function DelayNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const config = (d.config ?? {}) as Record<string, unknown>;
  const runStatus = d._runStatus as string | undefined;
  const delayMs = (config.delay_ms as number) ?? 1000;

  return (
    <Box sx={{ ...nodeStatusStyles(runStatus, selected, "#64748b"), minWidth: 120, textAlign: "center" }}>
      <Handle type="target" position={Position.Top} />
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5, p: 1 }}>
        <Timer sx={{ fontSize: 16, color: "#64748b" }} />
        <Typography variant="body2" fontWeight={600}>
          {delayMs < 1000 ? `${delayMs} ms` : `${(delayMs / 1000).toFixed(1)} s`}
        </Typography>
      </Box>
      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
}
