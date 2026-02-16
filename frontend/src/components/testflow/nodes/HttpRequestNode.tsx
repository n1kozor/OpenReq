import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Typography, Chip } from "@mui/material";
import { Http } from "@mui/icons-material";
import { nodeStatusStyles } from "./shared";

export default function HttpRequestNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const config = (d.config ?? {}) as Record<string, unknown>;
  const method =
    (config.inline_request as Record<string, string>)?.method ||
    (config.request_name_hint as string) ||
    "GET";
  const runStatus = d._runStatus as string | undefined;
  const statusCode = d._statusCode as number | undefined;
  const elapsedMs = d._elapsedMs as number | undefined;

  return (
    <Box sx={{ ...nodeStatusStyles(runStatus, selected, "#22c55e"), minWidth: 200 }}>
      <Handle type="target" position={Position.Top} />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Http sx={{ fontSize: 16, color: "#22c55e" }} />
        <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1 }}>
          {(d.label as string) || "HTTP Request"}
        </Typography>
        <Chip label={method} size="small" sx={{ fontSize: "0.65rem", height: 18, fontWeight: 700 }} />
      </Box>
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
