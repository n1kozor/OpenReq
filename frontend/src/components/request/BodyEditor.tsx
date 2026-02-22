import { useRef, useCallback, useState, useMemo } from "react";
import {
  Box,
  ToggleButtonGroup,
  ToggleButton,
  Typography,
  Button,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Checkbox,
  IconButton,
  Chip,
  Tabs,
  Tab,
  Tooltip,
  CircularProgress,
  Snackbar,
  Alert,
} from "@mui/material";
import { Delete, AttachFile, Add } from "@mui/icons-material";
import Editor, { type Monaco } from "@monaco-editor/react";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import KeyValueEditor from "@/components/common/KeyValueEditor";
import { newPair, VariableValueCell } from "@/components/common/KeyValueEditor";
import { registerVariableProviders, getVariableTheme } from "@/utils/monacoVariables";
import type { BodyType, KeyValuePair } from "@/types";
import type { VariableGroup, VariableInfo } from "@/hooks/useVariableGroups";
import { Hub, AccountTree } from "@mui/icons-material";
import GQLSchemaExplorer from "./GQLSchemaExplorer";
import { proxyApi } from "@/api/endpoints";
import type { AuthType, OAuthConfig, GQLSchema } from "@/types";
import { INTROSPECTION_QUERY, parseIntrospectionResult } from "./graphqlSchema";

interface BodyEditorProps {
  bodyType: BodyType;
  body: string;
  graphqlQuery?: string;
  graphqlVariables?: string;
  graphqlUrl?: string;
  headers?: KeyValuePair[];
  authType?: AuthType;
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  apiKeyName?: string;
  apiKeyValue?: string;
  apiKeyPlacement?: "header" | "query";
  oauthConfig?: OAuthConfig;
  formData: KeyValuePair[];
  onBodyTypeChange: (t: BodyType) => void;
  onBodyChange: (b: string) => void;
  onGraphqlQueryChange?: (q: string) => void;
  onGraphqlVariablesChange?: (v: string) => void;
  onFormDataChange: (pairs: KeyValuePair[]) => void;
  variableGroups?: VariableGroup[];
  resolvedVariables?: Map<string, VariableInfo>;
}

function editorLanguage(bodyType: BodyType): string {
  if (bodyType === "json") return "json";
  if (bodyType === "xml") return "xml";
  return "plaintext";
}

export default function BodyEditor({
  bodyType,
  body,
  graphqlQuery,
  graphqlVariables,
  graphqlUrl,
  headers = [],
  authType = "none",
  bearerToken = "",
  basicUsername = "",
  basicPassword = "",
  apiKeyName = "",
  apiKeyValue = "",
  apiKeyPlacement = "header",
  oauthConfig,
  formData,
  onBodyTypeChange,
  onBodyChange,
  onGraphqlQueryChange,
  onGraphqlVariablesChange,
  onFormDataChange,
  variableGroups = [],
  resolvedVariables,
}: BodyEditorProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const isDark = theme.palette.mode === "dark";
  const [gqlTab, setGqlTab] = useState(0);
  const [schema, setSchema] = useState<GQLSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [showExplorer, setShowExplorer] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; severity: "success" | "error" | "info" } | null>(null);
  const gqlVariablesError = useMemo(() => {
    if (bodyType !== "graphql") return "";
    if (gqlTab !== 1) return "";
    const raw = graphqlVariables ?? "";
    if (!raw.trim()) return "";
    try {
      JSON.parse(raw);
      return "";
    } catch {
      return t("response.invalidJson");
    }
  }, [bodyType, gqlTab, graphqlVariables, t]);

  const handleFetchSchema = useCallback(async () => {
    if (!graphqlUrl) return;
    setSchemaLoading(true);
    try {
      const reqHeaders: Record<string, string> = {};
      for (const h of headers) {
        if (h.enabled && h.key) reqHeaders[h.key] = h.value;
      }
      reqHeaders["Content-Type"] = "application/json";

      let resolvedAuthType: AuthType = authType;
      const authConfig: Record<string, string> = {};
      if (authType === "bearer") authConfig.token = bearerToken;
      else if (authType === "basic") { authConfig.username = basicUsername; authConfig.password = basicPassword; }
      else if (authType === "api_key") { authConfig.key = apiKeyName; authConfig.value = apiKeyValue; authConfig.placement = apiKeyPlacement; }
      else if (authType === "oauth2" && oauthConfig?.accessToken) {
        resolvedAuthType = "bearer";
        authConfig.token = oauthConfig.accessToken;
      }

      const { data } = await proxyApi.send({
        method: "POST",
        url: graphqlUrl,
        headers: reqHeaders,
        body: JSON.stringify({ query: INTROSPECTION_QUERY }),
        body_type: "json",
        auth_type: resolvedAuthType,
        auth_config: Object.keys(authConfig).length > 0 ? authConfig : undefined,
      });

      if (data.status_code !== 200) {
        setSnack({ msg: t("graphql.schemaFetchError"), severity: "error" });
        return;
      }

      const parsed = JSON.parse(data.body);
      if (parsed.errors?.length) {
        setSnack({ msg: parsed.errors[0]?.message || t("graphql.schemaParseError"), severity: "error" });
        return;
      }

      const result = parseIntrospectionResult(parsed.data.__schema);
      setSchema(result);
      setShowExplorer(true);
      const typeCount = Object.keys(result.types).length;
      setSnack({ msg: t("graphql.schemaReady", { count: typeCount }), severity: "success" });
    } catch {
      setSnack({ msg: t("graphql.schemaFetchError"), severity: "error" });
    } finally {
      setSchemaLoading(false);
    }
  }, [graphqlUrl, headers, authType, bearerToken, basicUsername, basicPassword, apiKeyName, apiKeyValue, apiKeyPlacement, oauthConfig, t]);

  const handleInsertQuery = useCallback((query: string, variables: string) => {
    onGraphqlQueryChange?.(query);
    if (variables && variables !== "{}") {
      onGraphqlVariablesChange?.(variables);
    }
    setGqlTab(0);
    setSnack({ msg: t("graphql.queryInserted"), severity: "info" });
  }, [onGraphqlQueryChange, onGraphqlVariablesChange, t]);

  // Keep latest variables in a ref so Monaco providers always see fresh data
  const variablesRef = useRef({ groups: variableGroups, resolved: resolvedVariables ?? new Map<string, VariableInfo>() });
  variablesRef.current = { groups: variableGroups, resolved: resolvedVariables ?? new Map<string, VariableInfo>() };

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    registerVariableProviders(monaco, () => variablesRef.current);
  }, []);

  const handleFormDataFieldChange = useCallback(
    (id: string, field: keyof KeyValuePair, value: string | boolean) => {
      onFormDataChange(
        formData.map((p) => (p.id === id ? { ...p, [field]: value } : p))
      );
    },
    [formData, onFormDataChange],
  );

  const handleFileSelect = useCallback(
    (id: string, file: File | null) => {
      onFormDataChange(
        formData.map((p) =>
          p.id === id
            ? { ...p, file, fileName: file?.name ?? "", type: "file" as const }
            : p
        ),
      );
    },
    [formData, onFormDataChange],
  );

  const handleTypeChange = useCallback(
    (id: string, type: "text" | "file") => {
      onFormDataChange(
        formData.map((p) =>
          p.id === id ? { ...p, type, file: null, fileName: "", value: "" } : p
        ),
      );
    },
    [formData, onFormDataChange],
  );

  const handleAddPair = useCallback(() => {
    onFormDataChange([...formData, newPair()]);
  }, [formData, onFormDataChange]);

  const handleRemovePair = useCallback(
    (id: string) => {
      const next = formData.filter((p) => p.id !== id);
      onFormDataChange(next.length > 0 ? next : [newPair()]);
    },
    [formData, onFormDataChange],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, height: "100%" }}>
      <ToggleButtonGroup
        value={bodyType}
        exclusive
        onChange={(_, v) => v && onBodyTypeChange(v)}
        size="small"
      >
        <ToggleButton value="none">{t("request.none")}</ToggleButton>
        <ToggleButton value="json">JSON</ToggleButton>
        <ToggleButton value="xml">XML</ToggleButton>
        <ToggleButton value="text">Text</ToggleButton>
        <ToggleButton value="graphql">{t("protocol.graphql")}</ToggleButton>
        <ToggleButton value="form-data">form-data</ToggleButton>
        <ToggleButton value="x-www-form-urlencoded">x-www-form-urlencoded</ToggleButton>
      </ToggleButtonGroup>

      {bodyType === "none" && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          {t("request.noBody")}
        </Typography>
      )}

      {(bodyType === "json" || bodyType === "xml" || bodyType === "text") && (
        <Box sx={{ flex: 1, minHeight: 220 }}>
          <Editor
            height="100%"
            language={editorLanguage(bodyType)}
            theme={getVariableTheme(isDark)}
            value={body}
            onChange={(v) => onBodyChange(v ?? "")}
            beforeMount={handleBeforeMount}
            options={{
              minimap: { enabled: false },
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              fontSize: 13,
              tabSize: 2,
              formatOnPaste: true,
              automaticLayout: true,
            }}
          />
        </Box>
      )}

      {bodyType === "graphql" && (
        <Box sx={{ display: "flex", gap: 1, minHeight: 220, height: "100%" }}>
          {showExplorer && schema && (
            <Box
              sx={{
                width: 260,
                minWidth: 260,
                flexShrink: 0,
                border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.15)}`,
                borderRadius: 1,
                overflow: "hidden",
              }}
            >
              <GQLSchemaExplorer schema={schema} onInsertQuery={handleInsertQuery} />
            </Box>
          )}
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Tabs value={gqlTab} onChange={(_, v) => setGqlTab(v)} sx={{ minHeight: 30 }}>
                <Tab label={t("graphql.query")} sx={{ minHeight: 30 }} />
                <Tab label={t("graphql.variables")} sx={{ minHeight: 30 }} />
              </Tabs>
              <Box sx={{ flexGrow: 1 }} />
              <Tooltip title={t("graphql.fetchSchema")}>
                <span>
                  <IconButton onClick={handleFetchSchema} disabled={!graphqlUrl || schemaLoading} size="small">
                    {schemaLoading ? <CircularProgress size={16} /> : <AccountTree sx={{ fontSize: 18, color: schema ? "#e879f9" : "inherit" }} />}
                  </IconButton>
                </span>
              </Tooltip>
              {schema && (
                <Tooltip title={t("graphql.schemaExplorer")}>
                  <IconButton onClick={() => setShowExplorer((v) => !v)} size="small" sx={{ color: showExplorer ? "#e879f9" : "inherit" }}>
                    <Hub sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            <Box sx={{ flex: 1, minHeight: 200 }}>
              {gqlTab === 0 && (
                <Editor
                  height="100%"
                  language="graphql"
                  theme={getVariableTheme(isDark)}
                  value={graphqlQuery ?? ""}
                  onChange={(v) => onGraphqlQueryChange?.(v ?? "")}
                  beforeMount={handleBeforeMount}
                  options={{
                    minimap: { enabled: false },
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    fontSize: 13,
                    tabSize: 2,
                    wordWrap: "on",
                    automaticLayout: true,
                  }}
                />
              )}
              {gqlTab === 1 && (
                <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                  <Box sx={{ flex: 1, minHeight: 0 }}>
                    <Editor
                      height="100%"
                      language="json"
                      theme={getVariableTheme(isDark)}
                      value={graphqlVariables ?? "{}"}
                      onChange={(v) => onGraphqlVariablesChange?.(v ?? "")}
                      beforeMount={handleBeforeMount}
                      options={{
                        minimap: { enabled: false },
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        tabSize: 2,
                        wordWrap: "on",
                        automaticLayout: true,
                      }}
                    />
                  </Box>
                  {gqlVariablesError && (
                    <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                      {gqlVariablesError}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {bodyType === "x-www-form-urlencoded" && (
        <KeyValueEditor
          pairs={formData}
          onChange={onFormDataChange}
          keyLabel={t("environment.key")}
          valueLabel={t("common.value")}
          resolvedVariables={resolvedVariables}
          variableGroups={variableGroups}
        />
      )}

      {bodyType === "form-data" && (
        <Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem", width: 80 }}>
                  {t("bodyEditor.type", "Type")}
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem" }}>
                  {t("environment.key")}
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem" }}>
                  {t("common.value")}
                </TableCell>
                <TableCell padding="checkbox" />
              </TableRow>
            </TableHead>
            <TableBody>
              {formData.map((pair) => (
                <TableRow key={pair.id} sx={{ "&:hover": { bgcolor: "action.hover" } }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={pair.enabled}
                      onChange={(e) =>
                        handleFormDataFieldChange(pair.id, "enabled", e.target.checked)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      value={pair.type || "text"}
                      onChange={(e) =>
                        handleTypeChange(pair.id, e.target.value as "text" | "file")
                      }
                      sx={{ fontSize: "0.78rem", minWidth: 70 }}
                    >
                      <MenuItem value="text">{t("bodyEditor.textType", "Text")}</MenuItem>
                      <MenuItem value="file">{t("bodyEditor.fileType", "File")}</MenuItem>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <VariableValueCell
                      value={pair.key}
                      onChange={(v) => handleFormDataFieldChange(pair.id, "key", v)}
                      placeholder={t("environment.key")}
                      resolvedVariables={resolvedVariables}
                      variableGroups={variableGroups}
                    />
                  </TableCell>
                  <TableCell>
                    {(pair.type || "text") === "text" ? (
                      <VariableValueCell
                        value={pair.value}
                        onChange={(v) => handleFormDataFieldChange(pair.id, "value", v)}
                        placeholder={t("common.value")}
                        resolvedVariables={resolvedVariables}
                        variableGroups={variableGroups}
                      />
                    ) : (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          component="label"
                          startIcon={<AttachFile sx={{ fontSize: 14 }} />}
                          sx={{ textTransform: "none", fontSize: "0.75rem" }}
                        >
                          {t("bodyEditor.selectFile", "Select File")}
                          <input
                            type="file"
                            hidden
                            onChange={(e) =>
                              handleFileSelect(pair.id, e.target.files?.[0] ?? null)
                            }
                          />
                        </Button>
                        {pair.fileName ? (
                          <Chip
                            label={pair.fileName}
                            size="small"
                            onDelete={() => handleFileSelect(pair.id, null)}
                            sx={{ fontSize: "0.75rem" }}
                          />
                        ) : (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontSize: "0.75rem" }}
                          >
                            {t("bodyEditor.noFileSelected", "No file selected")}
                          </Typography>
                        )}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell padding="checkbox">
                    <IconButton size="small" onClick={() => handleRemovePair(pair.id)}>
                      <Delete sx={{ fontSize: 16 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button
            size="small"
            startIcon={<Add sx={{ fontSize: 14 }} />}
            onClick={handleAddPair}
            sx={{ mt: 0.5, textTransform: "none", fontSize: "0.78rem" }}
          >
            {t("common.add")}
          </Button>
        </Box>
      )}

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={snack?.severity ?? "info"} onClose={() => setSnack(null)} sx={{ minWidth: 250 }}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
