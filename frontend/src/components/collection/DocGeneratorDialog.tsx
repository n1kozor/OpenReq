import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  LinearProgress,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  Checkbox,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  CircularProgress,
  Chip,
  IconButton,
  Collapse,
  alpha,
  useTheme,
} from "@mui/material";
import {
  AutoAwesome,
  Close,
  Description,
  Download,
  FolderZip,
  Language,
  Visibility,
  Speed,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { docsApi, appSettingsApi } from "@/api/endpoints";
import type { OllamaModel, OpenAIModel } from "@/types";

interface DocGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
  collectionId: string;
  collectionName: string;
  folderId?: string | null;
  folderName?: string | null;
}

type Phase = "config" | "generating" | "preview";

const DOC_LANGUAGES: Record<string, string> = {
  en: "English",
  hu: "Magyar",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  pt: "Português",
  it: "Italiano",
  ja: "日本語",
  zh: "中文",
  ko: "한국어",
};

const SDK_LANGUAGES: Record<string, string> = {
  curl: "cURL",
  python: "Python",
  javascript_fetch: "JS (fetch)",
  javascript_axios: "JS (axios)",
  go: "Go",
  java: "Java",
  csharp: "C#",
  php: "PHP",
};

export default function DocGeneratorDialog({
  open,
  onClose,
  collectionId,
  collectionName,
  folderId,
  folderName,
}: DocGeneratorDialogProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  // Config state
  const [docLanguage, setDocLanguage] = useState("en");
  const [useAI, setUseAI] = useState(false);
  const [aiProvider, setAiProvider] = useState<"openai" | "ollama">("openai");
  const [ollamaModel, setOllamaModel] = useState("");
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [openaiModel, setOpenaiModel] = useState("");
  const [openaiModels, setOpenaiModels] = useState<OpenAIModel[]>([]);
  const [openaiLoading, setOpenaiLoading] = useState(false);
  const [extraPrompt, setExtraPrompt] = useState("");
  const [includeSDK, setIncludeSDK] = useState(false);
  const [sdkLanguages, setSdkLanguages] = useState<string[]>([
    "curl",
    "python",
  ]);

  // Generation state
  const [phase, setPhase] = useState<Phase>("config");
  const [progressMsg, setProgressMsg] = useState("");
  const [requestCount, setRequestCount] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    type: "html" | "zip";
    html: string;
    zip_base64?: string;
    filename: string;
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // Load AI provider settings on open
  useEffect(() => {
    if (!open) return;
    appSettingsApi.get().then(({ data }) => {
      if (data.ai_provider)
        setAiProvider(data.ai_provider as "openai" | "ollama");
      if (data.openai_model) setOpenaiModel(data.openai_model);
      if (data.ollama_model) setOllamaModel(data.ollama_model);
    });
  }, [open]);

  // Load Ollama models when provider changes to ollama
  useEffect(() => {
    if (!useAI || aiProvider !== "ollama") return;
    setOllamaLoading(true);
    appSettingsApi
      .getOllamaModels()
      .then(({ data }) => {
        setOllamaModels(data);
        if (data.length > 0 && !ollamaModel && data[0]) {
          setOllamaModel(data[0].name);
        }
      })
      .catch(() => setOllamaModels([]))
      .finally(() => setOllamaLoading(false));
  }, [useAI, aiProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load OpenAI models when provider changes to openai
  useEffect(() => {
    if (!useAI || aiProvider !== "openai" || openaiModels.length > 0) return;
    setOpenaiLoading(true);
    appSettingsApi
      .getOpenAIModels()
      .then(({ data }) => {
        setOpenaiModels(data);
      })
      .catch(() => setOpenaiModels([]))
      .finally(() => setOpenaiLoading(false));
  }, [useAI, aiProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setPhase("config");
    setProgressMsg("");
    setRequestCount(0);
    setError("");
    setResult(null);

    onClose();
  }, [onClose]);

  const handleGenerate = useCallback(() => {
    setPhase("generating");
    setError("");
    setResult(null);

    setProgressMsg(t("docGenerator.collectingRequests"));

    const ctrl = docsApi.generateStream(
      {
        collection_id: collectionId,
        folder_id: folderId || undefined,
        doc_language: docLanguage,
        use_ai: useAI,
        extra_prompt: useAI && extraPrompt ? extraPrompt : undefined,
        include_sdk: includeSDK,
        sdk_languages: includeSDK ? sdkLanguages : undefined,
        provider: useAI ? aiProvider : undefined,
        model: useAI ? (aiProvider === "ollama" ? ollamaModel : openaiModel || undefined) : undefined,
      },
      {
        onProgress: (p, data) => {
          switch (p) {
            case "collecting":
              setProgressMsg(t("docGenerator.collectingRequests"));
              break;
            case "collected":
              setRequestCount((data.count as number) || 0);
              setProgressMsg(
                t("docGenerator.requestsFound", {
                  count: data.count as number,
                })
              );
              break;
            case "sdk":
              setProgressMsg(t("docGenerator.generatingSDK"));
              break;
            case "sdk_done":
              setProgressMsg(t("docGenerator.sdkDone"));
              break;
            case "generating":
              setProgressMsg(t("docGenerator.generatingWithAI"));
              break;
            case "ai_done":
              setProgressMsg(t("docGenerator.almostDone"));
              break;
            case "ai_fallback":
              setProgressMsg(t("docGenerator.aiFallback"));
              break;
            case "rendering":
              setProgressMsg(t("docGenerator.rendering"));
              break;
          }
        },
        onChunk: () => {
          // HTML arrives in chunks but we use the final result from onComplete
        },
        onComplete: (res) => {
          setResult(res);
          setPhase("preview");
        },
        onError: (msg) => {
          setError(msg);
          setPhase("config");
        },
      }
    );

    abortRef.current = ctrl;
  }, [
    collectionId,
    folderId,
    docLanguage,
    useAI,
    extraPrompt,
    includeSDK,
    sdkLanguages,
    aiProvider,
    ollamaModel,
    openaiModel,
    t,
  ]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    if (result.type === "zip" && result.zip_base64) {
      const binary = atob(result.zip_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } else if (result.html) {
      const blob = new Blob([result.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [result]);

  const toggleSdkLang = (lang: string) => {
    setSdkLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const targetLabel = folderName
    ? t("docGenerator.forFolder", { name: folderName })
    : t("docGenerator.forCollection", { name: collectionName });

  const canGenerate = !useAI || aiProvider !== "ollama" || !!ollamaModel;

  return (
    <Dialog
      open={open}
      onClose={phase === "generating" ? undefined : handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          minHeight: phase === "preview" ? "85vh" : undefined,
          background:
            theme.palette.mode === "dark"
              ? "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)"
              : "linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%)",
        },
      }}
    >
      <DialogTitle
        sx={{ display: "flex", alignItems: "center", gap: 1.5, pb: 1 }}
      >
        <Description sx={{ fontSize: 28, color: "primary.main" }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={700}>
            {t("docGenerator.title")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {targetLabel}
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: phase === "preview" ? 0 : 3 }}>
        {error && (
          <Alert
            severity="error"
            sx={{ mb: 2, mx: phase === "preview" ? 3 : 0 }}
          >
            {error}
          </Alert>
        )}

        {/* ── Config Phase ── */}
        {phase === "config" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            {/* Documentation Language */}
            <FormControl fullWidth>
              <InputLabel>{t("docGenerator.docLanguage")}</InputLabel>
              <Select
                value={docLanguage}
                label={t("docGenerator.docLanguage")}
                onChange={(e) => setDocLanguage(e.target.value)}
              >
                {Object.entries(DOC_LANGUAGES).map(([code, label]) => (
                  <MenuItem key={code} value={code}>
                    <Box
                      sx={{ display: "flex", alignItems: "center", gap: 1 }}
                    >
                      <Language sx={{ fontSize: 18, opacity: 0.6 }} />
                      {label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* AI Enrichment Toggle */}
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                border: `1px solid ${alpha(
                  useAI
                    ? theme.palette.primary.main
                    : theme.palette.divider,
                  useAI ? 0.4 : 1
                )}`,
                background: useAI
                  ? alpha(theme.palette.primary.main, 0.04)
                  : "transparent",
                transition: "all 0.2s",
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={useAI}
                    onChange={(e) => setUseAI(e.target.checked)}
                    color="primary"
                  />
                }
                label={
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 1 }}
                  >
                    <AutoAwesome sx={{ fontSize: 20 }} />
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        {t("docGenerator.useAI")}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                      >
                        {t("docGenerator.useAIDesc")}
                      </Typography>
                    </Box>
                  </Box>
                }
              />

              {/* AI Options — only visible when AI is enabled */}
              <Collapse in={useAI}>
                <Box
                  sx={{
                    mt: 2,
                    ml: 2,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  {/* AI Provider */}
                  <Box>
                    <Typography
                      variant="caption"
                      fontWeight={600}
                      color="text.secondary"
                      sx={{ mb: 0.5, display: "block" }}
                    >
                      {t("docGenerator.aiProvider")}
                    </Typography>
                    <ToggleButtonGroup
                      value={aiProvider}
                      exclusive
                      onChange={(_, v) => v && setAiProvider(v)}
                      fullWidth
                      size="small"
                    >
                      <ToggleButton value="openai">
                        <AutoAwesome sx={{ mr: 1, fontSize: 16 }} />
                        OpenAI
                      </ToggleButton>
                      <ToggleButton value="ollama">
                        <Box
                          component="span"
                          sx={{ mr: 1, fontWeight: 700, fontSize: 13 }}
                        >
                          🦙
                        </Box>
                        Ollama
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Box>

                  {/* OpenAI Model */}
                  {aiProvider === "openai" && (
                    <FormControl fullWidth size="small">
                      <InputLabel>
                        {t("settings.openaiModel")}
                      </InputLabel>
                      <Select
                        value={openaiModel}
                        label={t("settings.openaiModel")}
                        onChange={(e) => setOpenaiModel(e.target.value)}
                        disabled={openaiLoading}
                        endAdornment={
                          openaiLoading ? (
                            <CircularProgress size={18} sx={{ mr: 2 }} />
                          ) : undefined
                        }
                      >
                        {openaiModels.length > 0 ? (
                          openaiModels.map((m) => (
                            <MenuItem key={m.id} value={m.id}>
                              {m.id}
                            </MenuItem>
                          ))
                        ) : (
                          [
                            <MenuItem key="gpt-4.1-mini" value="gpt-4.1-mini">gpt-4.1-mini</MenuItem>,
                            <MenuItem key="gpt-4.1" value="gpt-4.1">gpt-4.1</MenuItem>,
                            <MenuItem key="gpt-5-mini" value="gpt-5-mini">gpt-5-mini</MenuItem>,
                          ]
                        )}
                      </Select>
                    </FormControl>
                  )}

                  {/* Ollama Model */}
                  {aiProvider === "ollama" && (
                    <FormControl fullWidth size="small">
                      <InputLabel>
                        {t("docGenerator.ollamaModel")}
                      </InputLabel>
                      <Select
                        value={ollamaModel}
                        label={t("docGenerator.ollamaModel")}
                        onChange={(e) => setOllamaModel(e.target.value)}
                        disabled={ollamaLoading}
                        endAdornment={
                          ollamaLoading ? (
                            <CircularProgress size={18} sx={{ mr: 2 }} />
                          ) : undefined
                        }
                      >
                        {ollamaModels.map((m) => (
                          <MenuItem key={m.name} value={m.name}>
                            {m.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  {/* Extra Prompt */}
                  <TextField
                    label={t("docGenerator.extraPrompt")}
                    placeholder={t("docGenerator.extraPromptHint")}
                    multiline
                    rows={2}
                    value={extraPrompt}
                    onChange={(e) => setExtraPrompt(e.target.value)}
                    fullWidth
                    size="small"
                  />
                </Box>
              </Collapse>
            </Box>

            {/* SDK Toggle */}
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    checked={includeSDK}
                    onChange={(e) => setIncludeSDK(e.target.checked)}
                    color="primary"
                  />
                }
                label={
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 1 }}
                  >
                    <FolderZip sx={{ fontSize: 20, opacity: 0.7 }} />
                    <Typography variant="body2" fontWeight={600}>
                      {t("docGenerator.includeSDK")}
                    </Typography>
                  </Box>
                }
              />

              {/* SDK Languages */}
              <Collapse in={includeSDK}>
                <Box
                  sx={{
                    mt: 1,
                    ml: 2,
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 1,
                  }}
                >
                  {Object.entries(SDK_LANGUAGES).map(([key, label]) => (
                    <Chip
                      key={key}
                      label={label}
                      size="small"
                      variant={
                        sdkLanguages.includes(key) ? "filled" : "outlined"
                      }
                      color={
                        sdkLanguages.includes(key) ? "primary" : "default"
                      }
                      onClick={() => toggleSdkLang(key)}
                      icon={
                        <Checkbox
                          checked={sdkLanguages.includes(key)}
                          size="small"
                          sx={{ p: 0, ml: 0.5 }}
                        />
                      }
                      sx={{ pl: 0.5 }}
                    />
                  ))}
                </Box>
              </Collapse>
            </Box>
          </Box>
        )}

        {/* ── Generating Phase ── */}
        {phase === "generating" && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              py: 4,
            }}
          >
            {useAI ? (
              <AutoAwesome
                sx={{
                  fontSize: 48,
                  color: "primary.main",
                  animation: "spin 2s linear infinite",
                  "@keyframes spin": {
                    "0%": { transform: "rotate(0deg)" },
                    "100%": { transform: "rotate(360deg)" },
                  },
                }}
              />
            ) : (
              <Speed
                sx={{
                  fontSize: 48,
                  color: "success.main",
                }}
              />
            )}
            <Typography variant="h6" fontWeight={600}>
              {t("docGenerator.generating")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {progressMsg}
            </Typography>
            {requestCount > 0 && (
              <Chip
                label={t("docGenerator.requestsFound", {
                  count: requestCount,
                })}
                color="primary"
                variant="outlined"
                size="small"
              />
            )}
            <LinearProgress
              sx={{ width: "100%", maxWidth: 400, borderRadius: 2 }}
            />
          </Box>
        )}

        {/* ── Preview Phase ── */}
        {phase === "preview" && result && (
          <Box sx={{ height: "calc(85vh - 140px)", width: "100%" }}>
            <iframe
              srcDoc={result.html}
              title="Documentation Preview"
              style={{ width: "100%", height: "100%", border: "none" }}
              sandbox="allow-scripts allow-same-origin"
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        {phase === "config" && (
          <>
            <Button onClick={handleClose} color="inherit">
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleGenerate}
              variant="contained"
              startIcon={useAI ? <AutoAwesome /> : <Description />}
              disabled={!canGenerate}
            >
              {t("docGenerator.generate")}
            </Button>
          </>
        )}

        {phase === "generating" && (
          <Button
            onClick={() => {
              if (abortRef.current) abortRef.current.abort();
              setPhase("config");
            }}
            color="inherit"
          >
            {t("common.cancel")}
          </Button>
        )}

        {phase === "preview" && (
          <>
            <Button
              onClick={() => {
                setPhase("config");
                setResult(null);
                        
              }}
              color="inherit"
            >
              {t("common.back")}
            </Button>
            <Button
              onClick={() => {
                if (result?.html) {
                  const w = window.open("", "_blank");
                  if (w) {
                    w.document.write(result.html);
                    w.document.close();
                  }
                }
              }}
              variant="outlined"
              startIcon={<Visibility />}
            >
              {t("docGenerator.preview")}
            </Button>
            <Button
              onClick={handleDownload}
              variant="contained"
              startIcon={
                result?.type === "zip" ? <FolderZip /> : <Download />
              }
            >
              {result?.type === "zip"
                ? t("docGenerator.downloadZIP")
                : t("docGenerator.downloadHTML")}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
