import { useState, useEffect, useCallback } from "react";
import {
  Drawer,
  Toolbar,
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Chip,
  IconButton,
  Divider,
  CircularProgress,
  Menu,
  MenuItem,
} from "@mui/material";
import { Close, DeleteSweep, Refresh, ContentCopy, OpenInNew } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { historyApi, type HistoryEntry } from "@/api/endpoints";

const METHOD_COLORS: Record<string, string> = {
  GET: "#34d399",
  POST: "#fbbf24",
  PUT: "#818cf8",
  PATCH: "#f472b6",
  DELETE: "#f87171",
  HEAD: "#38bdf8",
  OPTIONS: "#a78bfa",
};

interface HistoryPanelProps {
  open: boolean;
  onClose: () => void;
  onLoadRequest: (method: string, url: string) => void;
}

export default function HistoryPanel({ open, onClose, onLoadRequest }: HistoryPanelProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ anchor: HTMLElement; entry: HistoryEntry } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await historyApi.list(100);
      setEntries(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleClear = async () => {
    await historyApi.clear();
    setEntries([]);
  };

  const handleContextMenu = (e: React.MouseEvent, entry: HistoryEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ anchor: e.currentTarget as HTMLElement, entry });
  };

  const handleCopyUrl = () => {
    if (contextMenu) {
      navigator.clipboard.writeText(contextMenu.entry.url);
    }
    setContextMenu(null);
  };

  const handleOpenInTab = () => {
    if (contextMenu) {
      onLoadRequest(contextMenu.entry.method, contextMenu.entry.url);
    }
    setContextMenu(null);
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  const truncateUrl = (url: string, max = 50) =>
    url.length > max ? url.slice(0, max) + "..." : url;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ "& .MuiDrawer-paper": { width: 380 } }}
    >
      <Toolbar variant="dense" sx={{ minHeight: 44 }} />
      <Box sx={{ p: 2, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="h6">{t("nav.history")}</Typography>
        <Box>
          <IconButton size="small" onClick={load}><Refresh fontSize="small" /></IconButton>
          <IconButton size="small" onClick={handleClear} color="error"><DeleteSweep fontSize="small" /></IconButton>
          <IconButton size="small" onClick={onClose}><Close fontSize="small" /></IconButton>
        </Box>
      </Box>
      <Divider />

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      <List dense sx={{ overflow: "auto", flexGrow: 1 }}>
        {entries.length === 0 && !loading && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
            {t("common.noData")}
          </Typography>
        )}
        {entries.map((entry) => (
          <ListItemButton
            key={entry.id}
            onClick={() => onLoadRequest(entry.method, entry.url)}
            onContextMenu={(e) => handleContextMenu(e, entry)}
          >
            <ListItemText
              primary={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Chip
                    label={entry.method}
                    size="small"
                    sx={{
                      height: 20, fontSize: 10, fontWeight: 700,
                      bgcolor: METHOD_COLORS[entry.method] ?? "#888",
                      color: "#000",
                    }}
                  />
                  <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: 12 }}>
                    {truncateUrl(entry.url)}
                  </Typography>
                </Box>
              }
              secondary={
                <Box sx={{ display: "flex", gap: 1, mt: 0.5, alignItems: "center" }}>
                  {entry.status_code && (
                    <Chip
                      label={entry.status_code}
                      size="small"
                      color={entry.status_code < 400 ? "success" : "error"}
                      sx={{ height: 18, fontSize: 10 }}
                    />
                  )}
                  {entry.elapsed_ms && (
                    <Typography variant="caption" color="text.secondary">
                      {entry.elapsed_ms.toFixed(0)}ms
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {formatTime(entry.created_at)}
                  </Typography>
                </Box>
              }
            />
          </ListItemButton>
        ))}
      </List>

      {/* History entry context menu */}
      <Menu
        anchorEl={contextMenu?.anchor}
        open={!!contextMenu}
        onClose={() => setContextMenu(null)}
      >
        <MenuItem onClick={handleOpenInTab}>
          <OpenInNew sx={{ mr: 1, fontSize: 18 }} /> {t("common.openInNewTab")}
        </MenuItem>
        <MenuItem onClick={handleCopyUrl}>
          <ContentCopy sx={{ mr: 1, fontSize: 18 }} /> {t("common.copyUrl")}
        </MenuItem>
      </Menu>
    </Drawer>
  );
}
