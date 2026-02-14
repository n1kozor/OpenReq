import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  List,
} from "@mui/material";
import { Code, Download } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { sdkApi } from "@/api/endpoints";
import type { Collection } from "@/types";

interface SDKGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
  collections: Collection[];
}

const SDK_LANGUAGES = [
  {
    value: "csharp",
    label: "C#",
    description: "HttpClient-based SDK with async/await support",
    extension: ".cs",
  },
  {
    value: "python",
    label: "Python",
    description: "Requests library-based SDK with type hints",
    extension: ".py",
  },
];

export default function SDKGeneratorDialog({
  open,
  onClose,
  collections,
}: SDKGeneratorDialogProps) {
  const { t } = useTranslation();
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<"csharp" | "python">("csharp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!selectedCollectionId) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await sdkApi.generate(selectedCollectionId, selectedLanguage);

      // Extract filename from Content-Disposition header
      const contentDisposition = response.headers["content-disposition"];
      let filename = `sdk.${selectedLanguage === "csharp" ? "cs" : "py"}`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      // Download file
      const blob = new Blob([response.data], {
        type: selectedLanguage === "csharp" ? "text/x-csharp" : "text/x-python",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setSuccess(t("sdk.generated", { language: selectedLanguage.toUpperCase() }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("sdk.generationFailed")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccess(null);
    setSelectedCollectionId("");
    setSelectedLanguage("csharp");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {t("sdk.title")}
        <Chip
          label="BETA"
          size="small"
          color="warning"
          sx={{ fontSize: "0.65rem", height: 20, fontWeight: 700 }}
        />
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t("sdk.description")}
        </Typography>

        {/* Collection Selection */}
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>{t("sdk.selectCollection")}</InputLabel>
          <Select
            value={selectedCollectionId}
            onChange={(e) => setSelectedCollectionId(e.target.value)}
            label={t("sdk.selectCollection")}
          >
            {collections.length === 0 ? (
              <MenuItem disabled>
                <em>{t("importExport.noCollections")}</em>
              </MenuItem>
            ) : (
              collections.map((col) => (
                <MenuItem key={col.id} value={col.id}>
                  {col.name}
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>

        <Divider sx={{ my: 2 }} />

        {/* Language Selection */}
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          {t("sdk.selectLanguage")}
        </Typography>

        <List dense disablePadding>
          {SDK_LANGUAGES.map((lang) => (
            <ListItemButton
              key={lang.value}
              selected={selectedLanguage === lang.value}
              onClick={() => setSelectedLanguage(lang.value as "csharp" | "python")}
              sx={{ borderRadius: 1.5, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Code sx={{ fontSize: 18 }} />
              </ListItemIcon>
              <ListItemText
                primary={lang.label}
                secondary={lang.description}
                primaryTypographyProps={{ fontWeight: 600, fontSize: "0.9rem" }}
                secondaryTypographyProps={{ fontSize: "0.78rem" }}
              />
              {selectedLanguage === lang.value && (
                <Chip
                  label={t("common.selected")}
                  size="small"
                  color="primary"
                  sx={{ height: 22, fontSize: "0.7rem" }}
                />
              )}
            </ListItemButton>
          ))}
        </List>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>{t("common.cancel")}</Button>
        <Button
          variant="contained"
          onClick={handleGenerate}
          disabled={!selectedCollectionId || loading}
          startIcon={loading ? <CircularProgress size={16} /> : <Download />}
        >
          {t("sdk.generate")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
