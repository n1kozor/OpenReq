import { type NodeProps, NodeResizer, useReactFlow } from "@xyflow/react";
import { Box, Typography } from "@mui/material";
import { FolderOpen } from "@mui/icons-material";
import { useCallback, useState, type DragEvent } from "react";

export default function GroupNode({ id, data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const config = (d.config ?? {}) as Record<string, unknown>;
  const color = (config.color as string) || "#3b82f6";
  const runStatus = d._runStatus as string | undefined;
  const childCount = (d._childCount as number) || 0;
  const [dragOver, setDragOver] = useState(false);
  const { setNodes } = useReactFlow();

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      // Check if a node is being dropped from within the flow
      const nodeId = e.dataTransfer.getData("application/reactflow-node");
      if (nodeId && nodeId !== id) {
        // Reparent the dropped node into this group
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id === nodeId) {
              return {
                ...n,
                parentId: id,
                extent: "parent" as const,
                position: { x: 20, y: 40 + childCount * 80 },
              };
            }
            return n;
          })
        );
      }
    },
    [id, childCount, setNodes]
  );

  const statusBorder =
    runStatus === "running"
      ? `2px solid ${color}`
      : runStatus === "success"
      ? "2px solid #22c55e"
      : runStatus === "error"
      ? "2px solid #ef4444"
      : `1.5px dashed ${color}50`;

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        minWidth: 300,
        minHeight: 200,
        width: "100%",
        height: "100%",
        border: dragOver ? `2px solid ${color}` : statusBorder,
        borderRadius: 2,
        bgcolor: dragOver ? `${color}15` : `${color}08`,
        transition: "border-color 0.15s, background-color 0.15s",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <NodeResizer
        isVisible={!!selected}
        minWidth={250}
        minHeight={150}
        lineStyle={{ borderColor: color }}
        handleStyle={{ backgroundColor: color, width: 8, height: 8 }}
      />
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 0.5,
          borderBottom: `1px solid ${color}20`,
          userSelect: "none",
        }}
      >
        <FolderOpen sx={{ fontSize: 14, color: `${color}cc` }} />
        <Typography
          variant="caption"
          fontWeight={700}
          sx={{ color: `${color}cc`, flex: 1 }}
          noWrap
        >
          {(d.label as string) || "Group"}
        </Typography>
        {childCount > 0 && (
          <Typography variant="caption" sx={{ color: `${color}80`, fontSize: "0.6rem" }}>
            {childCount} node{childCount !== 1 ? "s" : ""}
          </Typography>
        )}
      </Box>
      {/* Drop zone body */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 1,
        }}
      >
        {childCount === 0 && !dragOver && (
          <Typography variant="caption" sx={{ color: `${color}40`, fontStyle: "italic" }}>
            Drag nodes here
          </Typography>
        )}
      </Box>
    </Box>
  );
}
