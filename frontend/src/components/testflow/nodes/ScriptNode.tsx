import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Typography, Chip } from "@mui/material";
import { Code } from "@mui/icons-material";
import { nodeStatusStyles } from "./shared";

export default function ScriptNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const config = (d.config ?? {}) as Record<string, unknown>;
  const runStatus = d._runStatus as string | undefined;
  const lang = (config.language as string) || "javascript";

  return (
    <Box sx={{ ...nodeStatusStyles(runStatus, selected, "#f59e0b"), minWidth: 170 }}>
      <Handle type="target" position={Position.Top} />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1 }}>
        <Code sx={{ fontSize: 16, color: "#f59e0b" }} />
        <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1 }}>
          {(d.label as string) || "Script"}
        </Typography>
        <Chip label={lang === "python" ? "PY" : "JS"} size="small" sx={{ fontSize: "0.6rem", height: 16 }} />
      </Box>
      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
}
