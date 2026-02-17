import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Typography } from "@mui/material";
import { DataObject } from "@mui/icons-material";
import { nodeStatusStyles } from "./shared";

export default function SetVariableNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const config = (d.config ?? {}) as Record<string, unknown>;
  const runStatus = d._runStatus as string | undefined;
  const animating = d._animating as boolean | undefined;
  const assignments = (config.assignments as { key: string; value: string }[]) || [];

  return (
    <Box sx={{ ...nodeStatusStyles(runStatus, selected, "#f97316", animating), minWidth: 160 }}>
      <Handle type="target" position={Position.Top} />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, borderBottom: assignments.length ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
        <DataObject sx={{ fontSize: 16, color: "#f97316" }} />
        <Typography variant="body2" fontWeight={600} noWrap>
          {(d.label as string) || "Set Variable"}
        </Typography>
      </Box>
      {assignments.length > 0 && (
        <Box sx={{ px: 1, py: 0.5 }}>
          {assignments.slice(0, 3).map((a, i) => (
            <Typography key={i} variant="caption" color="text.secondary" sx={{ display: "block", fontFamily: "monospace", fontSize: "0.65rem" }} noWrap>
              {a.key} = {a.value}
            </Typography>
          ))}
          {assignments.length > 3 && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem" }}>
              +{assignments.length - 3} more
            </Typography>
          )}
        </Box>
      )}
      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
}
