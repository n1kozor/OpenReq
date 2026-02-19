import { useState, useMemo } from "react";
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Collapse,
  IconButton,
  alpha,
} from "@mui/material";
import {
  Search as SearchIcon,
  ExpandMore,
  ChevronRight,
  FolderOpen,
  Api as ApiIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { DocEndpoint, DocFolderNode } from "@/types";

const METHOD_COLORS: Record<string, string> = {
  GET: "#22c55e",
  POST: "#eab308",
  PUT: "#3b82f6",
  PATCH: "#a855f7",
  DELETE: "#ef4444",
  HEAD: "#64748b",
  OPTIONS: "#64748b",
};

interface DocSidebarProps {
  title: string;
  endpoints: DocEndpoint[];
  folderTree: DocFolderNode[];
  activeIndex: number | null;
  onSelect: (index: number) => void;
}

export default function DocSidebar({
  title,
  endpoints,
  folderTree,
  activeIndex,
  onSelect,
}: DocSidebarProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["__all__"]));

  const filteredEndpoints = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return endpoints.filter(
      (ep) =>
        ep.name.toLowerCase().includes(q) ||
        ep.url.toLowerCase().includes(q) ||
        ep.method.toLowerCase().includes(q),
    );
  }, [search, endpoints]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderEndpointItem = (ep: DocEndpoint) => (
    <Box
      key={ep.index}
      onClick={() => onSelect(ep.index)}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        py: 0.75,
        cursor: "pointer",
        borderRadius: 1,
        transition: "background 0.15s",
        bgcolor: activeIndex === ep.index ? (theme) => alpha(theme.palette.primary.main, 0.12) : "transparent",
        "&:hover": {
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
        },
      }}
    >
      <Typography
        component="span"
        sx={{
          fontSize: 10,
          fontWeight: 700,
          fontFamily: "monospace",
          color: METHOD_COLORS[ep.method] || "#64748b",
          minWidth: 40,
          textAlign: "right",
        }}
      >
        {ep.method}
      </Typography>
      <Typography
        variant="body2"
        noWrap
        sx={{
          flex: 1,
          fontWeight: activeIndex === ep.index ? 600 : 400,
          color: activeIndex === ep.index ? "primary.main" : "text.primary",
        }}
      >
        {ep.name}
      </Typography>
    </Box>
  );

  const renderFolder = (node: DocFolderNode, path: string = "") => {
    const fullPath = path ? `${path}/${node.name}` : node.name;
    const isExpanded = expandedFolders.has(fullPath) || expandedFolders.has("__all__");

    if (!node.name) {
      // Root-level endpoints (no folder)
      return node.endpoints.map((idx) => {
        const ep = endpoints[idx];
        return ep ? renderEndpointItem(ep) : null;
      });
    }

    return (
      <Box key={fullPath}>
        <Box
          onClick={() => toggleFolder(fullPath)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            py: 0.5,
            cursor: "pointer",
            borderRadius: 1,
            "&:hover": { bgcolor: (theme) => alpha(theme.palette.action.hover, 0.04) },
          }}
        >
          <IconButton size="small" sx={{ p: 0 }}>
            {isExpanded ? <ExpandMore sx={{ fontSize: 16 }} /> : <ChevronRight sx={{ fontSize: 16 }} />}
          </IconButton>
          <FolderOpen sx={{ fontSize: 16, color: "text.secondary" }} />
          <Typography variant="body2" fontWeight={600} noWrap>
            {node.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
            {node.endpoints.length + node.children.reduce((s, c) => s + c.endpoints.length, 0)}
          </Typography>
        </Box>

        <Collapse in={isExpanded}>
          <Box sx={{ pl: 2 }}>
            {node.endpoints.map((idx) => {
              const ep = endpoints[idx];
              return ep ? renderEndpointItem(ep) : null;
            })}
            {node.children.map((child) => renderFolder(child, fullPath))}
          </Box>
        </Collapse>
      </Box>
    );
  };

  return (
    <Box
      sx={{
        width: 280,
        minWidth: 280,
        height: "100vh",
        position: "sticky",
        top: 0,
        borderRight: 1,
        borderColor: "divider",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.paper",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
          <ApiIcon sx={{ color: "primary.main", fontSize: 20 }} />
          <Typography variant="subtitle1" fontWeight={700} noWrap>
            {title}
          </Typography>
        </Box>
        <TextField
          fullWidth
          size="small"
          placeholder={t("share.searchEndpoints")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18 }} />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      {/* Navigation */}
      <Box sx={{ flex: 1, overflow: "auto", py: 1, px: 0.5 }}>
        {filteredEndpoints ? (
          filteredEndpoints.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
              {t("share.noResults")}
            </Typography>
          ) : (
            filteredEndpoints.map(renderEndpointItem)
          )
        ) : (
          folderTree.map((node) => renderFolder(node))
        )}
      </Box>

      {/* Footer */}
      <Box
        sx={{
          p: 1.5,
          borderTop: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.5,
          opacity: 0.5,
        }}
      >
        <ApiIcon sx={{ fontSize: 14 }} />
        <Typography variant="caption">{t("share.poweredBy")}</Typography>
      </Box>
    </Box>
  );
}
