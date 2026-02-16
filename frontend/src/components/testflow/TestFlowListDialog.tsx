import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, List, ListItemButton, ListItemText, ListItemIcon,
  IconButton, Typography, Box, Divider, CircularProgress,
} from "@mui/material";
import { AccountTree, Add, Delete, ContentCopy } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { testFlowsApi } from "@/api/endpoints";
import type { TestFlowSummary } from "@/types";

interface TestFlowListDialogProps {
  open: boolean;
  onClose: () => void;
  onOpenFlow: (flowId: string, flowName: string) => void;
  workspaceId: string | null;
}

export default function TestFlowListDialog({
  open,
  onClose,
  onOpenFlow,
  workspaceId,
}: TestFlowListDialogProps) {
  const { t } = useTranslation();
  const [flows, setFlows] = useState<TestFlowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const loadFlows = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const { data } = await testFlowsApi.list(workspaceId || undefined);
      setFlows(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [open, workspaceId]);

  useEffect(() => {
    loadFlows();
  }, [loadFlows]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await testFlowsApi.create({
        name: newName.trim(),
        workspace_id: workspaceId || undefined,
      });
      setNewName("");
      onOpenFlow(data.id, data.name);
      onClose();
    } catch {
      /* ignore */
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, flowId: string) => {
    e.stopPropagation();
    if (!confirm(t("testFlow.confirmDelete"))) return;
    try {
      await testFlowsApi.delete(flowId);
      setFlows((prev) => prev.filter((f) => f.id !== flowId));
    } catch {
      /* ignore */
    }
  };

  const handleDuplicate = async (e: React.MouseEvent, flowId: string) => {
    e.stopPropagation();
    try {
      const { data } = await testFlowsApi.duplicate(flowId);
      setFlows((prev) => [data, ...prev]);
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("testFlow.title")}</DialogTitle>
      <DialogContent dividers>
        {/* Create new flow */}
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <TextField
            label={t("testFlow.flowName")}
            size="small"
            fullWidth
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button
            variant="contained"
            size="small"
            startIcon={creating ? <CircularProgress size={16} /> : <Add />}
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            sx={{ whiteSpace: "nowrap" }}
          >
            {t("testFlow.newFlow")}
          </Button>
        </Box>

        <Divider sx={{ mb: 1 }} />

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : flows.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <AccountTree sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
            <Typography color="text.secondary">
              {t("testFlow.noFlows")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("testFlow.createFirst")}
            </Typography>
          </Box>
        ) : (
          <List dense>
            {flows.map((flow) => (
              <ListItemButton
                key={flow.id}
                onClick={() => {
                  onOpenFlow(flow.id, flow.name);
                  onClose();
                }}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <AccountTree sx={{ fontSize: 18, color: "primary.main" }} />
                </ListItemIcon>
                <ListItemText
                  primary={flow.name}
                  secondary={flow.description || new Date(flow.updated_at).toLocaleDateString()}
                  slotProps={{
                    primary: { fontWeight: 500, fontSize: "0.85rem" },
                    secondary: { fontSize: "0.7rem" },
                  }}
                />
                <IconButton
                  size="small"
                  onClick={(e) => handleDuplicate(e, flow.id)}
                  sx={{ mr: 0.5 }}
                >
                  <ContentCopy sx={{ fontSize: 16 }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={(e) => handleDelete(e, flow.id)}
                  color="error"
                >
                  <Delete sx={{ fontSize: 16 }} />
                </IconButton>
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
