import {
  Box,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  alpha,
} from "@mui/material";
import {
  Lock as LockIcon,
  Wifi as WsIcon,
  Hub as GqlIcon,
} from "@mui/icons-material";
import type { DocEndpoint as DocEndpointType } from "@/types";
import { useTranslation } from "react-i18next";

const METHOD_COLORS: Record<string, string> = {
  GET: "#22c55e",
  POST: "#eab308",
  PUT: "#3b82f6",
  PATCH: "#a855f7",
  DELETE: "#ef4444",
  HEAD: "#64748b",
  OPTIONS: "#64748b",
};

const METHOD_BG: Record<string, string> = {
  GET: "#22c55e18",
  POST: "#eab30818",
  PUT: "#3b82f618",
  PATCH: "#a855f718",
  DELETE: "#ef444418",
  HEAD: "#64748b18",
  OPTIONS: "#64748b18",
};

interface DocEndpointProps {
  endpoint: DocEndpointType;
}

function SchemaTree({ schema, depth = 0 }: { schema: unknown; depth?: number }) {
  if (!schema) return null;

  if (typeof schema === "string") {
    return (
      <Chip
        label={schema}
        size="small"
        variant="outlined"
        sx={{ fontFamily: "monospace", fontSize: 11 }}
      />
    );
  }

  if (Array.isArray(schema)) {
    return (
      <Box sx={{ pl: depth > 0 ? 2 : 0 }}>
        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
          {"Array["}
        </Typography>
        {(schema as unknown[]).map((item: unknown, i: number) => (
          <SchemaTree key={i} schema={item} depth={depth + 1} />
        ))}
        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
          {"]"}
        </Typography>
      </Box>
    );
  }

  if (typeof schema === "object" && schema !== null) {
    const entries = Object.entries(schema as Record<string, unknown>);
    return (
      <TableContainer component={Paper} variant="outlined" sx={{ mt: depth === 0 ? 1 : 0 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Field</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Type</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map(([key, val]) => (
              <TableRow key={key}>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace" fontSize={12}>
                    {key}
                  </Typography>
                </TableCell>
                <TableCell>
                  {typeof val === "string" ? (
                    <Chip label={val} size="small" variant="outlined" sx={{ fontFamily: "monospace", fontSize: 11 }} />
                  ) : typeof val === "object" && val !== null ? (
                    <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                      {Array.isArray(val) ? "array" : "object"}
                    </Typography>
                  ) : (
                    <Typography variant="caption" fontFamily="monospace">
                      {String(val ?? "")}
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  return null;
}

export default function DocEndpoint({ endpoint }: DocEndpointProps) {
  const { t } = useTranslation();
  const color = METHOD_COLORS[endpoint.method] || "#64748b";
  const bg = METHOD_BG[endpoint.method] || "#64748b18";

  return (
    <Box
      id={`endpoint-${endpoint.index}`}
      sx={{
        mb: 3,
        borderRadius: 2,
        border: 1,
        borderColor: "divider",
        overflow: "hidden",
        transition: "box-shadow 0.2s",
        "&:hover": { boxShadow: (theme) => `0 0 0 1px ${alpha(theme.palette.primary.main, 0.2)}` },
      }}
    >
      {/* Method + URL bar */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2,
          py: 1.5,
          bgcolor: bg,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Chip
          label={endpoint.method}
          size="small"
          sx={{
            fontWeight: 700,
            fontFamily: "monospace",
            color: "#fff",
            bgcolor: color,
            fontSize: 12,
            minWidth: 60,
          }}
        />
        <Typography
          variant="body1"
          fontFamily="monospace"
          fontWeight={500}
          sx={{ flex: 1, wordBreak: "break-all" }}
        >
          {endpoint.url}
        </Typography>
        {endpoint.protocol === "websocket" && (
          <Chip icon={<WsIcon />} label="WS" size="small" sx={{ bgcolor: "#14b8a6", color: "#fff" }} />
        )}
        {endpoint.protocol === "graphql" && (
          <Chip icon={<GqlIcon />} label="GQL" size="small" sx={{ bgcolor: "#e879f9", color: "#fff" }} />
        )}
        {endpoint.auth && (
          <Chip icon={<LockIcon />} label={endpoint.auth.type} size="small" variant="outlined" />
        )}
      </Box>

      {/* Content */}
      <Box sx={{ p: 2 }}>
        {/* Name + Description */}
        <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
          {endpoint.name}
        </Typography>
        {endpoint.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {endpoint.description}
          </Typography>
        )}
        {endpoint.notes && (
          <Typography
            variant="body2"
            sx={{
              mb: 2,
              p: 1.5,
              borderRadius: 1,
              bgcolor: (theme) => alpha(theme.palette.info.main, 0.08),
              borderLeft: 3,
              borderColor: "info.main",
            }}
          >
            {endpoint.notes}
          </Typography>
        )}

        {/* Folder */}
        {endpoint.folder && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            {endpoint.folder}
          </Typography>
        )}

        {/* Headers */}
        {endpoint.headers.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
              {t("share.headers")}
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Description</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {endpoint.headers.map((h) => (
                    <TableRow key={h.name}>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace" fontSize={12}>
                          {h.name}
                          {h.sensitive && (
                            <LockIcon sx={{ fontSize: 12, ml: 0.5, color: "warning.main", verticalAlign: "middle" }} />
                          )}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={h.type} size="small" variant="outlined" sx={{ fontFamily: "monospace", fontSize: 11 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontSize={12} color="text.secondary">
                          {h.description}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Query Params */}
        {endpoint.query_params.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
              {t("share.queryParams")}
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 600, fontSize: 12 }}>Description</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {endpoint.query_params.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace" fontSize={12}>
                          {p.name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={p.type} size="small" variant="outlined" sx={{ fontFamily: "monospace", fontSize: 11 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontSize={12} color="text.secondary">
                          {p.description}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Request Body */}
        {!!endpoint.body_schema && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                {t("share.requestBody")}
              </Typography>
              {endpoint.body_type && (
                <Chip label={endpoint.body_type} size="small" variant="outlined" sx={{ fontSize: 11 }} />
              )}
            </Box>
            <SchemaTree schema={endpoint.body_schema} />
          </Box>
        )}

        {/* Auth */}
        {endpoint.auth && (
          <Box>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
              {t("share.authentication")}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Chip
                icon={<LockIcon />}
                label={endpoint.auth.type.toUpperCase()}
                size="small"
                color="warning"
                variant="outlined"
              />
              {endpoint.auth.config_keys.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {endpoint.auth.config_keys.join(", ")}
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
