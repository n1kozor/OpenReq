import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Select,
  MenuItem,
  Box,
  IconButton,
  Tooltip,
  FormControl,
  InputLabel,
} from "@mui/material";
import { ContentCopy, Code, Check } from "@mui/icons-material";
import Editor from "@monaco-editor/react";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { codegenApi } from "@/api/endpoints";

interface CodeGenDialogProps {
  open: boolean;
  onClose: () => void;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  bodyType?: string;
  queryParams?: Record<string, string>;
  authType?: string;
  authConfig?: Record<string, string>;
}

const LANGUAGE_MONACO_MAP: Record<string, string> = {
  curl: "shell",
  python: "python",
  javascript_fetch: "javascript",
  javascript_axios: "javascript",
  go: "go",
  java: "java",
  csharp: "csharp",
  php: "php",
};

export default function CodeGenDialog({
  open,
  onClose,
  method,
  url,
  headers,
  body,
  bodyType,
  queryParams,
  authType,
  authConfig,
}: CodeGenDialogProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [language, setLanguage] = useState("curl");
  const [languages, setLanguages] = useState<Record<string, string>>({});
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      codegenApi.languages().then(({ data }) => {
        setLanguages(data.languages);
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open || !url) return;

    codegenApi
      .generate({
        language,
        method,
        url,
        headers,
        body: body || undefined,
        body_type: bodyType,
        query_params: queryParams,
        auth_type: authType,
        auth_config: authConfig,
      })
      .then(({ data }) => {
        setCode(data.code);
      })
      .catch(() => {
        setCode("// Error generating code");
      });
  }, [open, language, method, url, headers, body, bodyType, queryParams, authType, authConfig]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const editorTheme = theme.palette.mode === "dark" ? "vs-dark" : "light";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Code />
        {t("codegen.title")}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center" }}>
          <FormControl size="small" sx={{ minWidth: 280 }}>
            <InputLabel>{t("codegen.language")}</InputLabel>
            <Select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              label={t("codegen.language")}
            >
              {Object.entries(languages).map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Tooltip title={copied ? t("codegen.copied") : t("codegen.copy")}>
            <IconButton onClick={handleCopy} color={copied ? "success" : "default"}>
              {copied ? <Check /> : <ContentCopy />}
            </IconButton>
          </Tooltip>
        </Box>

        <Box
          sx={{
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <Editor
            height="400px"
            language={LANGUAGE_MONACO_MAP[language] || "plaintext"}
            theme={editorTheme}
            value={code}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              wordWrap: "on",
              automaticLayout: true,
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
        <Button
          variant="contained"
          onClick={handleCopy}
          startIcon={copied ? <Check /> : <ContentCopy />}
        >
          {copied ? t("codegen.copied") : t("codegen.copy")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
