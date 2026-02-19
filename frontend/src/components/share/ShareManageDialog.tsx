import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Switch,
  FormControlLabel,
  Chip,
  Divider,
  Alert,
  Tooltip,
  CircularProgress,
  Paper,
  InputAdornment,
} from "@mui/material";
import {
  ContentCopy,
  Delete,
  Add,
  Link as LinkIcon,
  Lock,
  LockOpen,
  Visibility,
  VisibilityOff,
  Close,
  OpenInNew,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { sharesApi } from "@/api/endpoints";
import type { ShareOut } from "@/types";

interface ShareManageDialogProps {
  open: boolean;
  onClose: () => void;
  collectionId: string;
  collectionName: string;
  folderId?: string | null;
  folderName?: string | null;
}

export default function ShareManageDialog({
  open,
  onClose,
  collectionId,
  collectionName,
  folderId,
  folderName,
}: ShareManageDialogProps) {
  const { t } = useTranslation();
  const [shares, setShares] = useState<ShareOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New share form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usePassword, setUsePassword] = useState(false);

  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await sharesApi.list(collectionId);
      setShares(data);
    } catch {
      setError("Failed to load shares");
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    if (open) {
      fetchShares();
      setShowCreateForm(false);
      setError(null);
    }
  }, [open, fetchShares]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await sharesApi.create({
        collection_id: collectionId,
        folder_id: folderId || null,
        title: newTitle.trim() || null,
        description_override: newDescription.trim() || null,
        password: usePassword && newPassword.trim() ? newPassword.trim() : null,
      });
      setShowCreateForm(false);
      setNewTitle("");
      setNewDescription("");
      setNewPassword("");
      setUsePassword(false);
      await fetchShares();
    } catch {
      setError("Failed to create share link");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (share: ShareOut) => {
    try {
      await sharesApi.update(share.id, { is_active: !share.is_active });
      await fetchShares();
    } catch {
      setError("Failed to update share");
    }
  };

  const handleDelete = async (shareId: string) => {
    try {
      await sharesApi.delete(shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch {
      setError("Failed to delete share");
    }
  };

  const copyLink = (share: ShareOut) => {
    const url = `${window.location.origin}${share.share_url}`;
    navigator.clipboard.writeText(url);
    setCopiedId(share.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openLink = (share: ShareOut) => {
    window.open(share.share_url, "_blank");
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LinkIcon />
          <Typography variant="h6" fontWeight={600}>
            {t("share.title")}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {folderId && folderName && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {t("share.folderShareNote")}: <strong>{folderName}</strong>
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Existing shares */}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : shares.length === 0 && !showCreateForm ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {t("share.noShares")}
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setShowCreateForm(true)}
            >
              {t("share.createLink")}
            </Button>
          </Box>
        ) : (
          <>
            {shares.map((share) => (
              <Paper
                key={share.id}
                variant="outlined"
                sx={{
                  p: 2,
                  mb: 1.5,
                  borderRadius: 2,
                  opacity: share.is_active ? 1 : 0.6,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <Typography variant="subtitle2" fontWeight={600} noWrap>
                        {share.title || collectionName}
                      </Typography>
                      {share.has_password && (
                        <Lock sx={{ fontSize: 14, color: "warning.main" }} />
                      )}
                      <Chip
                        label={share.is_active ? t("share.active") : t("share.inactive")}
                        size="small"
                        color={share.is_active ? "success" : "default"}
                        sx={{ fontSize: 10, height: 20 }}
                      />
                    </Box>
                    <Typography
                      variant="caption"
                      fontFamily="monospace"
                      color="text.secondary"
                      noWrap
                      sx={{ display: "block", mb: 0.5 }}
                    >
                      {window.location.origin}{share.share_url}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                      <Typography variant="caption" color="text.secondary">
                        {t("share.viewCount")}: {share.view_count}
                      </Typography>
                      {share.expires_at && (
                        <Typography variant="caption" color="text.secondary">
                          {t("share.expiresAt")}: {new Date(share.expires_at).toLocaleDateString()}
                        </Typography>
                      )}
                    </Box>
                  </Box>

                  <Box sx={{ display: "flex", gap: 0.5, ml: 1 }}>
                    <Tooltip title={t("share.copyLink")}>
                      <IconButton size="small" onClick={() => copyLink(share)}>
                        {copiedId === share.id ? (
                          <Typography variant="caption" color="success.main" sx={{ fontSize: 10 }}>
                            {t("share.linkCopied")}
                          </Typography>
                        ) : (
                          <ContentCopy sx={{ fontSize: 16 }} />
                        )}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Open">
                      <IconButton size="small" onClick={() => openLink(share)}>
                        <OpenInNew sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={share.is_active ? t("share.inactive") : t("share.active")}>
                      <IconButton size="small" onClick={() => handleToggleActive(share)}>
                        {share.is_active ? <Visibility sx={{ fontSize: 16 }} /> : <VisibilityOff sx={{ fontSize: 16 }} />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t("share.deleteShare")}>
                      <IconButton size="small" color="error" onClick={() => handleDelete(share.id)}>
                        <Delete sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Paper>
            ))}

            {!showCreateForm && (
              <Button
                fullWidth
                variant="outlined"
                startIcon={<Add />}
                onClick={() => setShowCreateForm(true)}
                sx={{ mt: 1 }}
              >
                {t("share.createLink")}
              </Button>
            )}
          </>
        )}

        {/* Create form */}
        {showCreateForm && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
              {t("share.createLink")}
            </Typography>

            <TextField
              fullWidth
              size="small"
              label={t("share.titleOverride")}
              placeholder={collectionName}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              sx={{ mb: 1.5 }}
            />

            <TextField
              fullWidth
              size="small"
              label={t("share.descriptionOverride")}
              multiline
              rows={2}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              sx={{ mb: 1.5 }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={usePassword}
                  onChange={(e) => setUsePassword(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  {usePassword ? <Lock sx={{ fontSize: 14 }} /> : <LockOpen sx={{ fontSize: 14 }} />}
                  <Typography variant="body2">{t("share.passwordProtected")}</Typography>
                </Box>
              }
              sx={{ mb: 1 }}
            />

            {usePassword && (
              <TextField
                fullWidth
                size="small"
                type={showPassword ? "text" : "password"}
                label={t("share.password")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                sx={{ mb: 1.5 }}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            )}

            <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
              <Button
                variant="text"
                size="small"
                onClick={() => setShowCreateForm(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<LinkIcon />}
                onClick={handleCreate}
                disabled={creating}
              >
                {creating ? "..." : t("share.createLink")}
              </Button>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
