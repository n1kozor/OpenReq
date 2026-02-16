import { type NodeProps, NodeResizer } from "@xyflow/react";
import { Box, Typography } from "@mui/material";

export default function GroupNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const config = (d.config ?? {}) as Record<string, unknown>;
  const color = (config.color as string) || "#3b82f6";

  return (
    <Box
      sx={{
        minWidth: config.width ? `${config.width}px` : 300,
        minHeight: config.height ? `${config.height}px` : 200,
        border: `1.5px dashed ${color}40`,
        borderRadius: 2,
        bgcolor: `${color}08`,
        p: 1,
      }}
    >
      <NodeResizer
        isVisible={!!selected}
        minWidth={200}
        minHeight={100}
        lineStyle={{ borderColor: color }}
        handleStyle={{ backgroundColor: color, width: 8, height: 8 }}
      />
      <Typography variant="caption" fontWeight={600} sx={{ color: `${color}cc`, userSelect: "none" }}>
        {(d.label as string) || "Group"}
      </Typography>
    </Box>
  );
}
