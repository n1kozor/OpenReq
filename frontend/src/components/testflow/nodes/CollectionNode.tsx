import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Typography } from "@mui/material";
import { FolderOpen } from "@mui/icons-material";
import { nodeStatusStyles } from "./shared";

export default function CollectionNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const config = (d.config ?? {}) as Record<string, unknown>;
  const runStatus = d._runStatus as string | undefined;

  return (
    <Box sx={{ ...nodeStatusStyles(runStatus, selected, "#3b82f6"), minWidth: 180 }}>
      <Handle type="target" position={Position.Top} />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1 }}>
        <FolderOpen sx={{ fontSize: 16, color: "#3b82f6" }} />
        <Typography variant="body2" fontWeight={600} noWrap>
          {(d.label as string) || "Collection"}
        </Typography>
      </Box>
      {typeof config.collection_name_hint === "string" && config.collection_name_hint && (
        <Box sx={{ px: 1, pb: 0.5 }}>
          <Typography variant="caption" color="text.secondary" noWrap>
            {config.collection_name_hint}
          </Typography>
        </Box>
      )}
      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
}
