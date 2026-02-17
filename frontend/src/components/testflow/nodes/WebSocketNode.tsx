import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Typography } from "@mui/material";
import { Cable } from "@mui/icons-material";
import { nodeStatusStyles } from "./shared";

export default function WebSocketNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const config = (d.config ?? {}) as Record<string, unknown>;
  const url = (config.ws_url as string) || "";
  const runStatus = d._runStatus as string | undefined;
  const statusCode = d._statusCode as number | undefined;
  const elapsedMs = d._elapsedMs as number | undefined;

  return (
    <Box sx={{ ...nodeStatusStyles(runStatus, selected, "#14b8a6"), minWidth: 200 }}>
      <Handle type="target" position={Position.Top} />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Cable sx={{ fontSize: 16, color: "#14b8a6" }} />
        <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1 }}>
          {(d.label as string) || "WebSocket"}
        </Typography>
      </Box>
      {url && (
        <Box sx={{ px: 1, py: 0.5 }}>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ fontFamily: "monospace", fontSize: 10 }}>
            {url.length > 35 ? url.slice(0, 35) + "..." : url}
          </Typography>
        </Box>
      )}
      {runStatus && statusCode !== undefined && (
        <Box sx={{ px: 1, py: 0.5, display: "flex", justifyContent: "space-between" }}>
          <Typography variant="caption" color={statusCode < 400 ? "success.main" : "error.main"}>
            {statusCode}
          </Typography>
          {elapsedMs !== undefined && (
            <Typography variant="caption" color="text.secondary">
              {elapsedMs < 1000 ? `${Math.round(elapsedMs)} ms` : `${(elapsedMs / 1000).toFixed(2)} s`}
            </Typography>
          )}
        </Box>
      )}
      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
}
