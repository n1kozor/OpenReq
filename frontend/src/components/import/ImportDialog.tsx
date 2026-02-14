import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tabs,
  Tab,
  Box,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Chip,
} from "@mui/material";
import {
  Upload,
  ContentPaste,
  SwapHoriz,
  Api,
  Terminal,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { importExportApi } from "@/api/endpoints";

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  workspaceId: string | null;
}

export default function ImportDialog({
  open,
  onClose,
  onImported,
  workspaceId,
}: ImportDialogProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [curlInput, setCurlInput] = useState("");
  const [curlName, setCurlName] = useState("");

  const handleFileImport = async (type: "postman" | "openapi") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = type === "postman" ? ".json" : ".json,.yaml,.yml";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const importFn =
          type === "postman"
            ? importExportApi.importPostman
            : importExportApi.importOpenApi;
        const { data } = await importFn(file, workspaceId ?? undefined);
        setSuccess(
          t("import.success", {
            name: data.collection_name,
            count: data.total_requests,
          })
        );
        onImported();
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : t("import.failed");
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  const handleCurlImport = async () => {
    if (!curlInput.trim()) return;

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data } = await importExportApi.importCurl(
        curlInput,
        curlName || undefined
      );
      setSuccess(t("import.curlSuccess", { name: data.name }));
      setCurlInput("");
      setCurlName("");
      onImported();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : t("import.curlFailed");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setSuccess(null);
    setCurlInput("");
    setCurlName("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>{t("import.title")}</DialogTitle>
      <DialogContent>
        <Tabs
          value={tab}
          onChange={(_, v) => {
            setTab(v);
            setError(null);
            setSuccess(null);
          }}
          sx={{ mb: 2 }}
        >
          <Tab
            icon={<SwapHoriz />}
            label={t("importExport.postman")}
            iconPosition="start"
            sx={{ minHeight: 48 }}
          />
          <Tab
            icon={<Api />}
            label="OpenAPI / Swagger"
            iconPosition="start"
            sx={{ minHeight: 48 }}
          />
          <Tab
            icon={<Terminal />}
            label="cURL"
            iconPosition="start"
            sx={{ minHeight: 48 }}
          />
        </Tabs>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        {/* Postman Import */}
        {tab === 0 && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              py: 4,
            }}
          >
            <Upload sx={{ fontSize: 48, color: "text.secondary" }} />
            <Typography variant="body1" color="text.secondary">
              {t("import.postmanDescription")}
            </Typography>
            <Chip label="Collection v2.1 (.json)" size="small" />
            <Button
              variant="contained"
              onClick={() => handleFileImport("postman")}
              disabled={loading}
              startIcon={
                loading ? <CircularProgress size={16} /> : <Upload />
              }
            >
              {t("import.selectFile")}
            </Button>
          </Box>
        )}

        {/* OpenAPI Import */}
        {tab === 1 && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              py: 4,
            }}
          >
            <Api sx={{ fontSize: 48, color: "text.secondary" }} />
            <Typography variant="body1" color="text.secondary">
              {t("import.openApiDescription")}
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Chip label="OpenAPI 3.x" size="small" />
              <Chip label="Swagger 2.0" size="small" />
              <Chip label="JSON / YAML" size="small" />
            </Box>
            <Button
              variant="contained"
              onClick={() => handleFileImport("openapi")}
              disabled={loading}
              startIcon={
                loading ? <CircularProgress size={16} /> : <Upload />
              }
            >
              {t("import.selectFile")}
            </Button>
          </Box>
        )}

        {/* cURL Import */}
        {tab === 2 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              {t("import.curlDescription")}
            </Typography>
            <TextField
              size="small"
              label={t("import.requestName")}
              value={curlName}
              onChange={(e) => setCurlName(e.target.value)}
              placeholder="My Request"
            />
            <TextField
              multiline
              minRows={6}
              maxRows={12}
              placeholder={`curl -X POST 'https://api.example.com/users' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer token123' \\
  -d '{"name": "John", "email": "john@example.com"}'`}
              value={curlInput}
              onChange={(e) => setCurlInput(e.target.value)}
              sx={{
                "& .MuiInputBase-input": {
                  fontFamily: "monospace",
                  fontSize: 13,
                },
              }}
            />
            <Button
              variant="contained"
              onClick={handleCurlImport}
              disabled={loading || !curlInput.trim()}
              startIcon={
                loading ? (
                  <CircularProgress size={16} />
                ) : (
                  <ContentPaste />
                )
              }
            >
              {t("import.importCurl")}
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
