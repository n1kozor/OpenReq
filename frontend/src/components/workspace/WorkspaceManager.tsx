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
} from "@mui/material";
import { useTranslation } from "react-i18next";
import type { Workspace } from "@/types";

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
  onRefresh: _onRefresh,
}: WorkspaceManagerProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(currentWorkspaceId);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t("nav.workspace")}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", gap: 2, minHeight: 350 }}>
          {/* Left: workspace list */}
          <Box sx={{ width: 240, flexShrink: 0, borderRight: 1, borderColor: "divider", pr: 2 }}>
            <List dense>
              {workspaces.map((ws) => (
                <ListItemButton
                  key={ws.id}
                  selected={selectedId === ws.id}
                  onClick={() => setSelectedId(ws.id)}
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

          {/* Right: details & members */}
          <Box sx={{ flexGrow: 1 }}>
            {selectedId ? (() => {
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
                  <Button
                    variant="contained"
                    onClick={() => { onSelectWorkspace(selectedId); onClose(); }}
                  >
                    {t("workspace.switchTo")}
                  </Button>
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
