import {
  Box,
  Chip,
  Typography,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  IconButton,
  Button,
} from "@mui/material";
import {
  DataObject,
  Code,
  Image,
  Web,
  AccountTree,
  ContentCopy,
  Timer,
  Storage,
  Send,
  Download,
  Schedule,
  ClearAll,
} from "@mui/icons-material";
import { Suspense, lazy, memo, useMemo, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import JsonTreeView from "@/components/response/JsonTreeView";
import type { ProxyResponse, SentRequestSnapshot } from "@/types";

function statusColor(code: number): "success" | "warning" | "error" | "info" {
  if (code < 300) return "success";
  if (code < 400) return "info";
  if (code < 500) return "warning";
  return "error";
}

function statusText(code: number): string {
  const map: Record<number, string> = {
    200: "OK", 201: "Created", 204: "No Content",
    301: "Moved Permanently", 302: "Found", 304: "Not Modified",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
    405: "Method Not Allowed", 409: "Conflict", 422: "Unprocessable Entity", 429: "Too Many Requests",
    500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable",
  };
  return map[code] ?? "";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function tryPrettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function tryParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractJsonFromMixed(raw: string): { json: unknown; pretty: string } | null {
  const brace = raw.indexOf("{");
  const bracket = raw.indexOf("[");
  let start = -1;
  if (brace >= 0 && bracket >= 0) start = Math.min(brace, bracket);
  else start = brace >= 0 ? brace : bracket;
  if (start < 0) return null;
  const candidate = raw.slice(start).trim();
  try {
    const parsed = JSON.parse(candidate);
    return { json: parsed, pretty: JSON.stringify(parsed, null, 2) };
  } catch {
    return null;
  }
}

type ContentCategory = "json" | "xml" | "html" | "image" | "text" | "binary";

function detectContentType(body: string, headers: Record<string, string>, isBinary: boolean, contentType: string): {
  language: string;
  category: ContentCategory;
} {
  if (isBinary) {
    const ct = contentType.toLowerCase();
    if (ct.startsWith("image/")) return { language: "plaintext", category: "image" };
    return { language: "plaintext", category: "binary" };
  }

  const ct = Object.entries(headers).find(([k]) => k.toLowerCase() === "content-type")?.[1] ?? "";

  if (ct.includes("json")) return { language: "json", category: "json" };
  if (ct.includes("html")) return { language: "html", category: "html" };
  if (ct.includes("xml")) return { language: "xml", category: "xml" };
  if (ct.includes("javascript")) return { language: "javascript", category: "text" };
  if (ct.includes("css")) return { language: "css", category: "text" };
  if (ct.includes("image/svg")) return { language: "xml", category: "image" };
  if (ct.includes("image/")) return { language: "plaintext", category: "image" };

  const trimmed = body.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return { language: "json", category: "json" };
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) return { language: "html", category: "html" };
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<")) return { language: "xml", category: "xml" };
  return { language: "plaintext", category: "text" };
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([byteNumbers], { type: mimeType });
}

function getMimeFromContentType(ct: string): string {
  return ct.split(";")[0]?.trim() || "application/octet-stream";
}

function getFileExtension(ct: string): string {
  const mime = getMimeFromContentType(ct);
  const map: Record<string, string> = {
    "application/pdf": ".pdf",
    "application/zip": ".zip",
    "application/gzip": ".gz",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "application/octet-stream": ".bin",
  };
  return map[mime] || ".bin";
}

type BodyViewMode = "pretty" | "raw" | "tree" | "preview";

interface ResponsePanelProps {
  response: ProxyResponse | null;
  sentRequest: SentRequestSnapshot | null;
  responseTimestamp?: number | null;
  onClearResponse?: () => void;
}

function ResponsePanel({ response, sentRequest, responseTimestamp, onClearResponse }: ResponsePanelProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [tab, setTab] = useState(0);
  const [bodyView, setBodyView] = useState<BodyViewMode>("pretty");
  const [sentBodyView, setSentBodyView] = useState<"pretty" | "raw">("pretty");
  const [showSecrets, setShowSecrets] = useState(false);
  const [cleanMixed, setCleanMixed] = useState(false);
  const [treeEnabled, setTreeEnabled] = useState(false);
  const editorTheme = isDark ? "vs-dark" : "light";
  const MonacoEditor = useMemo(
    () => lazy(() => import("@monaco-editor/react")),
    []
  );

  const responseBody = response?.body ?? "";
  const responseHeaders = response?.headers ?? {};
  const isBinary = response?.is_binary ?? false;
  const contentType = response?.content_type ?? "";
  const bodyBase64 = response?.body_base64 ?? null;
  const LARGE_JSON_THRESHOLD = 200000;

  const { language, category } = useMemo(
    () => detectContentType(responseBody, responseHeaders, isBinary, contentType),
    [responseBody, responseHeaders, isBinary, contentType]
  );
  const formattedBody = useMemo(
    () => (language === "json" ? tryPrettyJson(responseBody) : responseBody),
    [language, responseBody]
  );
  const headerEntries = useMemo(
    () => Object.entries(responseHeaders),
    [responseHeaders]
  );
  const sentHeaderEntries = useMemo(
    () => Object.entries(sentRequest?.headers ?? {}),
    [sentRequest?.headers]
  );
  const sentQueryEntries = useMemo(
    () => Object.entries(sentRequest?.query_params ?? {}),
    [sentRequest?.query_params]
  );

  const secretValues = sentRequest?.secret_values ?? [];
  const maskSecrets = useCallback((value: string) => {
    if (showSecrets || secretValues.length === 0) return value;
    let masked = value;
    for (const secret of secretValues) {
      if (!secret) continue;
      masked = masked.split(secret).join("******");
    }
    return masked;
  }, [showSecrets, secretValues]);
  const isJson = category === "json";
  const isHtml = category === "html";
  const isImage = category === "image";
  const shouldGateTree = isJson && responseBody.length > LARGE_JSON_THRESHOLD;
  const canRenderTree = !shouldGateTree || treeEnabled;
  const mixedJson = useMemo(() => extractJsonFromMixed(responseBody), [responseBody]);
  const parsedJson = useMemo(() => {
    if (!isJson) return null;
    if (bodyView !== "tree") return null;
    if (!canRenderTree) return null;
    return tryParseJson(responseBody);
  }, [isJson, bodyView, canRenderTree, responseBody]);

  const sentBody = sentRequest?.body ?? "";
  const sentBodyType = sentRequest?.body_type ?? "none";
  const sentBodyIsJson = sentBodyType === "json";
  const sentBodyPretty = useMemo(
    () => (sentBodyIsJson ? tryPrettyJson(sentBody) : sentBody),
    [sentBodyIsJson, sentBody]
  );

  useEffect(() => {
    if (bodyView !== "tree") setTreeEnabled(false);
  }, [bodyView, responseBody]);

  useEffect(() => {
    setCleanMixed(false);
  }, [responseBody, isBinary]);

  // Reset to appropriate view when binary response comes in
  useEffect(() => {
    if (isBinary && bodyView === "pretty") {
      if (isImage) setBodyView("preview");
    }
  }, [isBinary, isImage]);

  const handleDownload = useCallback(() => {
    if (!bodyBase64) return;
    const mime = getMimeFromContentType(contentType);
    const blob = base64ToBlob(bodyBase64, mime);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `response${getFileExtension(contentType)}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [bodyBase64, contentType]);

  const binaryImageUrl = useMemo(() => {
    if (!isBinary || !isImage || !bodyBase64) return null;
    const mime = getMimeFromContentType(contentType);
    return `data:${mime};base64,${bodyBase64}`;
  }, [isBinary, isImage, bodyBase64, contentType]);

  const binaryPdfUrl = useMemo(() => {
    if (!isBinary || !bodyBase64) return null;
    const mime = getMimeFromContentType(contentType);
    if (mime !== "application/pdf") return null;
    const blob = base64ToBlob(bodyBase64, mime);
    return URL.createObjectURL(blob);
  }, [isBinary, bodyBase64, contentType]);

  const availableViews = useMemo(() => {
    if (isBinary) {
      const views: { value: BodyViewMode; label: string; icon: React.ReactNode }[] = [];
      if (isImage || binaryPdfUrl) {
        views.push({
          value: "preview",
          label: t("response.preview"),
          icon: <Image sx={{ fontSize: 14 }} />,
        });
      }
      views.push({
        value: "raw",
        label: t("response.raw"),
        icon: <DataObject sx={{ fontSize: 14 }} />,
      });
      return views;
    }

    const views: { value: BodyViewMode; label: string; icon: React.ReactNode }[] = [
      { value: "pretty", label: t("response.pretty"), icon: <Code sx={{ fontSize: 14 }} /> },
      { value: "raw", label: t("response.raw"), icon: <DataObject sx={{ fontSize: 14 }} /> },
    ];

    if (isJson) {
      views.push({
        value: "tree",
        label: t("response.tree"),
        icon: <AccountTree sx={{ fontSize: 14 }} />,
      });
    }

    if (isHtml || isImage) {
      views.push({
        value: "preview",
        label: t("response.preview"),
        icon: isHtml ? <Web sx={{ fontSize: 14 }} /> : <Image sx={{ fontSize: 14 }} />,
      });
    }

    return views;
  }, [t, isJson, isHtml, isImage, isBinary, binaryPdfUrl]);

  if (!response) {
    return (
      <Box
        sx={{
          p: 4,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: 1,
        }}
      >
        <Send sx={{ fontSize: 32, color: "text.secondary", opacity: 0.3 }} />
        <Typography color="text.secondary" sx={{ fontSize: "0.85rem" }}>
          {t("response.noResponse")}
        </Typography>
      </Box>
    );
  }

  const statusChipColor = statusColor(response.status_code);
  const timeColor =
    response.elapsed_ms < 200
      ? theme.palette.success.main
      : response.elapsed_ms < 1000
      ? theme.palette.warning.main
      : theme.palette.error.main;

  return (
    <Box
      sx={{
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        height: "100%",
        overflow: "hidden",
      }}
    >
        {/* Status bar */}
      <Box
        sx={{
          display: "flex",
          gap: 1.5,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Chip
          label={`${response.status_code} ${statusText(response.status_code)}`}
          color={statusChipColor}
          size="small"
          sx={{
            fontWeight: 700,
            fontSize: "0.78rem",
            height: 26,
            borderRadius: 1.5,
          }}
        />

        {/* Time */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            py: 0.25,
            borderRadius: 1.5,
            backgroundColor: alpha(timeColor, 0.08),
          }}
        >
          <Timer sx={{ fontSize: 13, color: timeColor }} />
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, color: timeColor, fontSize: "0.75rem" }}
          >
            {response.elapsed_ms.toFixed(0)} ms
          </Typography>
        </Box>

        {/* Size */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 1,
            py: 0.25,
            borderRadius: 1.5,
            backgroundColor: alpha(theme.palette.info.main, 0.08),
          }}
        >
          <Storage sx={{ fontSize: 13, color: theme.palette.info.main }} />
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              color: theme.palette.info.main,
              fontSize: "0.75rem",
            }}
          >
            {formatBytes(response.size_bytes)}
          </Typography>
        </Box>

        {/* Timestamp + Clear */}
        {responseTimestamp && (
          <Tooltip title={new Date(responseTimestamp).toLocaleString()}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                px: 1,
                py: 0.25,
                borderRadius: 1.5,
                backgroundColor: alpha(theme.palette.text.secondary, 0.06),
                cursor: "default",
              }}
            >
              <Schedule sx={{ fontSize: 13, color: theme.palette.text.secondary }} />
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 500,
                  color: theme.palette.text.secondary,
                  fontSize: "0.7rem",
                }}
              >
                {new Date(responseTimestamp).toLocaleTimeString()}
              </Typography>
            </Box>
          </Tooltip>
        )}
        {onClearResponse && (
          <Button
            size="small"
            variant="text"
            startIcon={<ClearAll sx={{ fontSize: 14 }} />}
            onClick={onClearResponse}
            sx={{
              textTransform: "none",
              fontSize: "0.72rem",
              fontWeight: 500,
              color: theme.palette.text.secondary,
              minWidth: "auto",
              px: 1,
              py: 0.25,
              borderRadius: 1.5,
              "&:hover": {
                color: theme.palette.warning.main,
                backgroundColor: alpha(theme.palette.warning.main, 0.08),
              },
            }}
          >
            {t("response.clear")}
          </Button>
        )}

        {/* Download button for binary responses */}
        {isBinary && bodyBase64 && (
          <Tooltip title={t("response.download")}>
            <IconButton
              size="small"
              onClick={handleDownload}
              sx={{
                width: 28,
                height: 28,
                borderRadius: 1.5,
                "&:hover": {
                  backgroundColor: alpha(theme.palette.primary.main, 0.08),
                  color: theme.palette.primary.main,
                },
              }}
            >
              <Download sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}

        {/* Copy button (disabled for binary) */}
        {!isBinary && (
          <Tooltip title={t("codegen.copy")}>
            <IconButton
              size="small"
              onClick={() => navigator.clipboard.writeText(response.body)}
              sx={{
                width: 28,
                height: 28,
                borderRadius: 1.5,
                "&:hover": {
                  backgroundColor: alpha(theme.palette.primary.main, 0.08),
                  color: theme.palette.primary.main,
                },
              }}
            >
              <ContentCopy sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label={t("response.body")} />
        <Tab label={`${t("response.headers")} (${headerEntries.length})`} />
        <Tab label={t("response.sentRequest")} />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ animation: "fadeIn 0.2s ease", flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {/* View mode */}
          {availableViews.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <ToggleButtonGroup
                value={bodyView}
                exclusive
                onChange={(_, v) => v && setBodyView(v)}
                size="small"
              >
                {availableViews.map((v) => (
                  <ToggleButton
                    key={v.value}
                    value={v.value}
                    sx={{
                      py: 0.3,
                      px: 1.5,
                      fontSize: "0.72rem",
                      gap: 0.5,
                      borderRadius: "6px !important",
                    }}
                  >
                    {v.icon}
                    {v.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              {mixedJson && !isBinary && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setCleanMixed((prev) => !prev)}
                  sx={{ ml: 1, textTransform: "none", fontSize: "0.72rem" }}
                >
                  {cleanMixed ? t("response.showRaw", "Show raw") : t("response.cleanMixed", "Clean & pretty")}
                </Button>
              )}

            </Box>
          )}

          {/* Binary response info */}
          {isBinary && !isImage && !binaryPdfUrl && (
            <Box
              sx={{
                border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                borderRadius: 2,
                p: 3,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                bgcolor: isDark ? alpha("#0d1117", 0.5) : alpha("#f8fafc", 0.8),
              }}
            >
              <Download sx={{ fontSize: 40, color: "text.secondary", opacity: 0.5 }} />
              <Typography variant="body2" color="text.secondary">
                {t("response.binaryResponse")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("response.fileInfo", { type: getMimeFromContentType(contentType), size: formatBytes(response.size_bytes) })}
              </Typography>
              {bodyBase64 && (
                <Button
                  variant="outlined"
                  startIcon={<Download sx={{ fontSize: 16 }} />}
                  onClick={handleDownload}
                  sx={{ textTransform: "none" }}
                >
                  {t("response.downloadFile")}
                </Button>
              )}
            </Box>
          )}

          {/* Binary image preview */}
          {isBinary && isImage && binaryImageUrl && (bodyView === "preview" || availableViews.length <= 1) && (
            <Box
              sx={{
                border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                borderRadius: 2,
                p: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                minHeight: 200,
                bgcolor: isDark ? alpha("#0d1117", 0.5) : alpha("#f8fafc", 0.8),
              }}
            >
              <img
                src={binaryImageUrl}
                alt="Response"
                style={{ maxWidth: "100%", maxHeight: 400, objectFit: "contain" }}
              />
              <Typography variant="caption" color="text.secondary">
                {t("response.fileInfo", { type: getMimeFromContentType(contentType), size: formatBytes(response.size_bytes) })}
              </Typography>
            </Box>
          )}

          {/* Binary PDF preview */}
          {isBinary && binaryPdfUrl && bodyView === "preview" && (
            <Box
              sx={{
                border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                borderRadius: 2,
                flex: 1,
                overflow: "hidden",
                minHeight: 400,
              }}
            >
              <iframe
                src={binaryPdfUrl}
                style={{ width: "100%", height: "100%", border: "none" }}
                title="PDF Preview"
              />
            </Box>
          )}

          {/* Binary raw view (base64) */}
          {isBinary && bodyView === "raw" && (
            <Box
              sx={{
                borderRadius: 2,
                overflow: "hidden",
                border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                flex: 1,
                minHeight: 0,
              }}
            >
              <Suspense fallback={<Box sx={{ height: "100%" }} />}>
                <MonacoEditor
                  height="100%"
                  language="plaintext"
                  theme={editorTheme}
                  value={bodyBase64 ?? response.body}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 12.5,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    wordWrap: "on",
                    automaticLayout: true,
                    padding: { top: 8, bottom: 8 },
                    lineNumbers: "off",
                    renderLineHighlight: "none",
                    overviewRulerBorder: false,
                    scrollbar: {
                      verticalScrollbarSize: 6,
                      horizontalScrollbarSize: 6,
                    },
                  }}
                />
              </Suspense>
            </Box>
          )}

          {/* Text responses */}
          {!isBinary && bodyView === "pretty" && (
            <Box
              sx={{
                borderRadius: 2,
                overflow: "hidden",
                border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                flex: 1,
                minHeight: 0,
              }}
            >
              <Suspense fallback={<Box sx={{ height: "100%" }} />}>
                <MonacoEditor
                  height="100%"
                  language={language}
                  theme={editorTheme}
                  value={cleanMixed && mixedJson ? mixedJson.pretty : formattedBody}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 12.5,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    wordWrap: "on",
                    automaticLayout: true,
                    padding: { top: 8, bottom: 8 },
                    lineNumbers: "off",
                    renderLineHighlight: "none",
                    overviewRulerBorder: false,
                    scrollbar: {
                      verticalScrollbarSize: 6,
                      horizontalScrollbarSize: 6,
                    },
                  }}
                />
              </Suspense>
            </Box>
          )}

          {!isBinary && bodyView === "raw" && (
            <Box
              sx={{
                borderRadius: 2,
                overflow: "hidden",
                border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                flex: 1,
                minHeight: 0,
              }}
            >
              <Suspense fallback={<Box sx={{ height: "100%" }} />}>
                <MonacoEditor
                  height="100%"
                  language="plaintext"
                  theme={editorTheme}
                  value={response.body}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 12.5,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    wordWrap: "on",
                    automaticLayout: true,
                    padding: { top: 8, bottom: 8 },
                    lineNumbers: "off",
                    renderLineHighlight: "none",
                    overviewRulerBorder: false,
                    scrollbar: {
                      verticalScrollbarSize: 6,
                      horizontalScrollbarSize: 6,
                    },
                  }}
                />
              </Suspense>
            </Box>
          )}

          {!isBinary && bodyView === "tree" && parsedJson !== null && (
            <Box
              sx={{
                border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                borderRadius: 2,
                p: 1.5,
                flex: 1,
                overflow: "auto",
                bgcolor: isDark ? alpha("#0d1117", 0.5) : alpha("#f8fafc", 0.8),
              }}
            >
              <JsonTreeView data={parsedJson} />
            </Box>
          )}
          {!isBinary && bodyView === "tree" && isJson && shouldGateTree && !treeEnabled && (
            <Box
              sx={{
                border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                borderRadius: 2,
                p: 2,
                display: "flex",
                flexDirection: "column",
                gap: 1,
                alignItems: "flex-start",
                bgcolor: isDark ? alpha("#0d1117", 0.5) : alpha("#f8fafc", 0.8),
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {t("response.largeJson")}
              </Typography>
              <Button size="small" variant="outlined" onClick={() => setTreeEnabled(true)}>
                {t("response.renderTree")}
              </Button>
            </Box>
          )}
          {!isBinary && bodyView === "tree" && isJson && canRenderTree && parsedJson === null && (
            <Typography variant="body2" color="text.secondary">
              {t("response.invalidJson")}
            </Typography>
          )}

          {!isBinary && bodyView === "preview" && isHtml && (
            <Box
              sx={{
                border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                borderRadius: 2,
                flex: 1,
                overflow: "hidden",
                minHeight: 0,
              }}
            >
              <iframe
                srcDoc={response.body}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  background: "#fff",
                }}
                sandbox="allow-same-origin"
                title="HTML Preview"
              />
            </Box>
          )}

          {!isBinary && bodyView === "preview" && isImage && (
            <Box
              sx={{
                border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                borderRadius: 2,
                p: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 200,
                bgcolor: isDark ? alpha("#0d1117", 0.5) : alpha("#f8fafc", 0.8),
              }}
            >
              {response.body.startsWith("<") ? (
                <Box
                  dangerouslySetInnerHTML={{ __html: response.body }}
                  sx={{ maxWidth: "100%", maxHeight: 300 }}
                />
              ) : (
                <Typography color="text.secondary">
                  {t("response.binaryPreview")}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      )}

      {tab === 1 && (
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            borderRadius: 2,
            border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem" }}>
                  {t("request.header")}
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem" }}>
                  {t("common.value")}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {headerEntries.map(([key, value]) => (
                <TableRow key={key} sx={{ "&:hover": { bgcolor: "action.hover" } }}>
                  <TableCell
                    sx={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.75rem",
                      color: "primary.main",
                      fontWeight: 500,
                    }}
                  >
                    {key}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.75rem",
                      wordBreak: "break-all",
                    }}
                  >
                    {value}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {tab === 2 && (
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            animation: "fadeIn 0.2s ease",
          }}
        >
          {!sentRequest ? (
            <Typography variant="body2" color="text.secondary">
              {t("response.noSentRequest")}
            </Typography>
          ) : (
            <>
              <Box
                sx={{
                  borderRadius: 2,
                  border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                  p: 1.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexWrap: "wrap",
                }}
              >
                <Chip
                  label={sentRequest.method}
                  size="small"
                  sx={{ fontWeight: 700, fontSize: "0.72rem", height: 22 }}
                />
                <Typography
                  variant="body2"
                  sx={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem" }}
                >
                  {maskSecrets(sentRequest.url)}
                </Typography>
                {secretValues.length > 0 && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setShowSecrets((prev) => !prev)}
                    sx={{ ml: "auto", textTransform: "none", fontSize: "0.72rem" }}
                  >
                    {showSecrets ? t("response.hideSecrets") : t("response.showSecrets")}
                  </Button>
                )}
              </Box>

              {sentHeaderEntries.length > 0 && (
                <Box
                  sx={{
                    borderRadius: 2,
                    border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                    overflow: "hidden",
                  }}
                >
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem" }}>
                          {t("request.header")}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem" }}>
                          {t("common.value")}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sentHeaderEntries.map(([key, value]) => (
                        <TableRow key={key}>
                          <TableCell
                            sx={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: "0.75rem",
                              color: "primary.main",
                              fontWeight: 500,
                            }}
                          >
                            {key}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: "0.75rem",
                              wordBreak: "break-all",
                            }}
                          >
                            {maskSecrets(value)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}

              {sentQueryEntries.length > 0 && (
                <Box
                  sx={{
                    borderRadius: 2,
                    border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                    overflow: "hidden",
                  }}
                >
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem" }}>
                          {t("request.parameter")}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem" }}>
                          {t("common.value")}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sentQueryEntries.map(([key, value]) => (
                        <TableRow key={key}>
                          <TableCell
                            sx={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: "0.75rem",
                              color: "primary.main",
                              fontWeight: 500,
                            }}
                          >
                            {key}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: "0.75rem",
                              wordBreak: "break-all",
                            }}
                          >
                            {maskSecrets(value)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}

              {sentRequest.form_data && sentRequest.form_data.length > 0 && (
                <Box
                  sx={{
                    borderRadius: 2,
                    border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                    overflow: "hidden",
                  }}
                >
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem" }}>
                          {t("request.parameter")}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem" }}>
                          {t("common.value")}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem" }}>
                          {t("bodyEditor.type")}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sentRequest.form_data.map((item, idx) => (
                        <TableRow key={`${item.key}-${idx}`}>
                          <TableCell
                            sx={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: "0.75rem",
                              color: "primary.main",
                              fontWeight: 500,
                            }}
                          >
                            {item.key}
                          </TableCell>
                          <TableCell
                            sx={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: "0.75rem",
                              wordBreak: "break-all",
                            }}
                          >
                            {item.type === "file" ? (item.file_name ?? "") : maskSecrets(item.value)}
                          </TableCell>
                          <TableCell sx={{ fontSize: "0.75rem" }}>{item.type}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}

              {sentBody && (
                <Box
                  sx={{
                    borderRadius: 2,
                    overflow: "hidden",
                    border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                    flex: 1,
                    minHeight: 0,
                  }}
                >
                  {sentBodyIsJson && (
                    <Box sx={{ px: 1, py: 0.75, borderBottom: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.08)}` }}>
                      <ToggleButtonGroup
                        value={sentBodyView}
                        exclusive
                        onChange={(_, v) => v && setSentBodyView(v)}
                        size="small"
                      >
                        <ToggleButton value="pretty" sx={{ py: 0.2, px: 1.2, fontSize: "0.72rem", gap: 0.5 }}>
                          <Code sx={{ fontSize: 13 }} />
                          {t("response.pretty")}
                        </ToggleButton>
                        <ToggleButton value="raw" sx={{ py: 0.2, px: 1.2, fontSize: "0.72rem", gap: 0.5 }}>
                          <DataObject sx={{ fontSize: 13 }} />
                          {t("response.raw")}
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Box>
                  )}
                  <Suspense fallback={<Box sx={{ height: "100%" }} />}>
                    <MonacoEditor
                      height="100%"
                      language={sentBodyIsJson ? "json" : "plaintext"}
                      theme={editorTheme}
                      value={maskSecrets(sentBodyIsJson && sentBodyView === "pretty" ? sentBodyPretty : sentBody)}
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 12.5,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        wordWrap: "on",
                        automaticLayout: true,
                        padding: { top: 8, bottom: 8 },
                        lineNumbers: "off",
                        renderLineHighlight: "none",
                        overviewRulerBorder: false,
                        scrollbar: {
                          verticalScrollbarSize: 6,
                          horizontalScrollbarSize: 6,
                        },
                      }}
                    />
                  </Suspense>
                </Box>
              )}
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

export default memo(ResponsePanel);
