import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  TextField,
  IconButton,
  Alert,
} from "@mui/material";
import { Add, Close } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { Workspace } from "@/types";
import { workspacesApi } from "@/api/endpoints";

interface WorkspaceManagerProps {
  open: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onRefresh?: () => void;
}

export default function WorkspaceManager({
  open,
  onClose,
  workspaces,
  currentWorkspaceId,
  onSelectWorkspace,
  onRefresh,
}: WorkspaceManagerProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(currentWorkspaceId);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { data: ws } = await workspacesApi.create({
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      onRefresh?.();
      // Auto-switch to new workspace
      onSelectWorkspace(ws.id);
      onClose();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || t("common.error"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {t("nav.workspace")}
        <IconButton size="small" onClick={onClose}><Close fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", gap: 2, minHeight: 350 }}>
          {/* Left: workspace list + create button */}
          <Box sx={{ width: 260, flexShrink: 0, borderRight: 1, borderColor: "divider", pr: 2 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Add />}
              fullWidth
              onClick={() => setShowCreate(true)}
              sx={{ mb: 1.5 }}
            >
              {t("workspace.new")}
            </Button>
            <List dense>
              {workspaces.map((ws) => (
                <ListItemButton
                  key={ws.id}
                  selected={selectedId === ws.id}
                  onClick={() => { setSelectedId(ws.id); setShowCreate(false); }}
                >
                  <ListItemText
                    primary={ws.name}
                    secondary={ws.description}
                    primaryTypographyProps={{ fontWeight: currentWorkspaceId === ws.id ? 700 : 400 }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>

          {/* Right: details / create form */}
          <Box sx={{ flexGrow: 1 }}>
            {showCreate ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {t("workspace.new")}
                </Typography>
                {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
                <TextField
                  label={t("workspace.name")}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  fullWidth
                  size="small"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                />
                <TextField
                  label={t("common.description")}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  fullWidth
                  size="small"
                  multiline
                  rows={3}
                />
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Button
                    variant="contained"
                    onClick={handleCreate}
                    disabled={!newName.trim() || creating}
                  >
                    {creating ? t("common.loading") : t("common.create")}
                  </Button>
                  <Button onClick={() => { setShowCreate(false); setError(null); }}>
                    {t("common.cancel")}
                  </Button>
                </Box>
              </Box>
            ) : selectedId ? (() => {
              const ws = workspaces.find((w) => w.id === selectedId);
              return (
                <>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                    {ws?.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {ws?.description || "—"}
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  {currentWorkspaceId === selectedId ? (
                    <Typography variant="body2" color="success.main" fontWeight={500}>
                      {t("workspace.switchTo").replace("Switch to this", "Current")}
                    </Typography>
                  ) : (
                    <Button
                      variant="contained"
                      onClick={() => { onSelectWorkspace(selectedId); onClose(); }}
                    >
                      {t("workspace.switchTo")}
                    </Button>
                  )}
                </>
              );
            })() : (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                <Typography color="text.secondary">{t("workspace.select")}</Typography>
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
      </DialogActions>
    </Dialog>
  );
}
