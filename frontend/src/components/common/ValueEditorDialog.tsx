import { useState, useCallback, useMemo, useRef } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  Chip,
  Tooltip,
} from "@mui/material";
import { Close, AutoFixHigh, ContentCopy, Done } from "@mui/icons-material";
import Editor from "@monaco-editor/react";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { copyToClipboard } from "@/utils/clipboard";

/** Try to detect the language of a string value */
function detectLanguage(value: string): "json" | "xml" | "plaintext" {
  const trimmed = value.trim();
  if (!trimmed) return "plaintext";

  // JSON detection
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // might still be JSON-like but invalid
    }
  }

  // XML detection
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    return "xml";
  }

  return "plaintext";
}

/** Try to prettify JSON */
function tryPrettifyJson(value: string): string {
  const trimmed = value.trim();
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}

interface ValueEditorDialogProps {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (value: string) => void;
  title?: string;
  fieldKey?: string;
}

export default function ValueEditorDialog({
  open,
  onClose,
  value,
  onChange,
  title,
  fieldKey,
}: ValueEditorDialogProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const isDark = theme.palette.mode === "dark";
  const [draft, setDraft] = useState(value);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<any>(null);

  const language = useMemo(() => detectLanguage(draft), [draft]);

  const handleOpen = useCallback(() => {
    setDraft(value);
  }, [value]);

  const handleSave = useCallback(() => {
    onChange(draft);
    onClose();
  }, [draft, onChange, onClose]);

  const handlePrettify = useCallback(() => {
    if (language === "json") {
      setDraft(tryPrettifyJson(draft));
    }
  }, [draft, language]);

  const handleMinify = useCallback(() => {
    if (language === "json") {
      try {
        setDraft(JSON.stringify(JSON.parse(draft)));
      } catch {
        // ignore
      }
    }
  }, [draft, language]);

  const handleCopy = useCallback(() => {
    copyToClipboard(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [draft]);

  const languageLabel =
    language === "json" ? "JSON" : language === "xml" ? "XML" : "Text";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      TransitionProps={{ onEnter: handleOpen }}
      PaperProps={{
        sx: {
          height: "70vh",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          py: 1.5,
          px: 2,
        }}
      >
        <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
          {title || t("valueEditor.title")}
          {fieldKey && (
            <Typography
              component="span"
              variant="body2"
              color="text.secondary"
              sx={{ ml: 1, fontFamily: "monospace" }}
            >
              ({fieldKey})
            </Typography>
          )}
        </Typography>
        <Chip
          label={languageLabel}
          size="small"
          variant="outlined"
          sx={{ fontSize: 11, height: 22 }}
        />
        <IconButton size="small" onClick={onClose}>
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent
        sx={{
          flex: 1,
          p: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Editor
            height="100%"
            language={language}
            theme={isDark ? "vs-dark" : "vs"}
            value={draft}
            onChange={(v) => setDraft(v ?? "")}
            onMount={(editor) => {
              editorRef.current = editor;
            }}
            options={{
              minimap: { enabled: false },
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              fontSize: 13,
              tabSize: 2,
              wordWrap: "on",
              formatOnPaste: true,
              automaticLayout: true,
              padding: { top: 8 },
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 2, py: 1.5, gap: 0.5 }}>
        <Tooltip title={t("valueEditor.copy")}>
          <IconButton size="small" onClick={handleCopy}>
            {copied ? (
              <Done fontSize="small" color="success" />
            ) : (
              <ContentCopy fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
        {language === "json" && (
          <>
            <Tooltip title={t("valueEditor.prettify")}>
              <IconButton size="small" onClick={handlePrettify}>
                <AutoFixHigh fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button size="small" onClick={handleMinify} sx={{ textTransform: "none", fontSize: 12 }}>
              {t("valueEditor.minify")}
            </Button>
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} size="small">
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSave} variant="contained" size="small">
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export { detectLanguage };
