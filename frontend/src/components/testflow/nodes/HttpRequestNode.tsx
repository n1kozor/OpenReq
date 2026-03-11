import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Typography, Chip, Tooltip } from "@mui/material";
import { Http, Code } from "@mui/icons-material";
import { nodeStatusStyles } from "./shared";

export default function HttpRequestNode({ data, selected }: NodeProps) {
  const d = data as Record<string, unknown>;
  const config = (d.config ?? {}) as Record<string, unknown>;
  const method =
    (config.inline_request as Record<string, string>)?.method ||
    (config.request_name_hint as string) ||
    "GET";
  const runStatus = d._runStatus as string | undefined;
  const animating = d._animating as boolean | undefined;
  const statusCode = d._statusCode as number | undefined;
  const elapsedMs = d._elapsedMs as number | undefined;
  const hasPreScript = !!config._hasPreScript;
  const hasPostScript = !!config._hasPostScript;

  return (
    <Box sx={{ ...nodeStatusStyles(runStatus, selected, "#22c55e", animating), minWidth: 200 }}>
      <Handle type="target" position={Position.Top} />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <Http sx={{ fontSize: 16, color: "#22c55e" }} />
        <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1 }}>
          {(d.label as string) || "HTTP Request"}
        </Typography>
        <Chip label={method} size="small" sx={{ fontSize: "0.65rem", height: 18, fontWeight: 700 }} />
      </Box>
      {(hasPreScript || hasPostScript) && (
        <Box sx={{ display: "flex", gap: 0.5, px: 1, py: 0.5, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {hasPreScript && (
            <Tooltip title="Pre-request script" arrow>
              <Chip
                icon={<Code sx={{ fontSize: "12px !important" }} />}
                label="Pre"
                size="small"
                sx={{
                  fontSize: "0.6rem",
                  height: 18,
                  bgcolor: "rgba(245,158,11,0.15)",
                  color: "#f59e0b",
                  "& .MuiChip-icon": { color: "#f59e0b" },
                }}
              />
            </Tooltip>
          )}
          {hasPostScript && (
            <Tooltip title="Post-response script" arrow>
              <Chip
                icon={<Code sx={{ fontSize: "12px !important" }} />}
                label="Post"
                size="small"
                sx={{
                  fontSize: "0.6rem",
                  height: 18,
                  bgcolor: "rgba(139,92,246,0.15)",
                  color: "#8b5cf6",
                  "& .MuiChip-icon": { color: "#8b5cf6" },
                }}
              />
            </Tooltip>
          )}
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
