import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Box,
  Button,
  Tabs,
  Tab,
  Badge,
  CircularProgress,
  Typography,
  Portal,
  IconButton,
  Tooltip,
  Snackbar,
  Alert,
} from "@mui/material";
import { Hub, Send, Save, DragHandle, Code, AccountTree, AutoFixHigh } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import Editor from "@monaco-editor/react";
import KeyValueEditor from "@/components/common/KeyValueEditor";
import { VariableValueCell } from "@/components/common/KeyValueEditor";
import AuthEditor from "./AuthEditor";
import ResponsePanel from "./ResponsePanel";
import ScriptEditor from "./ScriptEditor";
import GQLSchemaExplorer from "./GQLSchemaExplorer";
import CodeGenDialog from "@/components/codegen/CodeGenDialog";
import { useVariableGroups } from "@/hooks/useVariableGroups";
import { proxyApi } from "@/api/endpoints";
import type {
  KeyValuePair, AuthType, OAuthConfig, ProxyResponse, Environment, EnvironmentVariable,
  ScriptResult, ScriptLanguage, SentRequestSnapshot, GQLSchema,
} from "@/types";
import { INTROSPECTION_QUERY, parseIntrospectionResult } from "./graphqlSchema";

const GQL_COLOR = "#e879f9";
const MIN_TOP = 120;
const MIN_BOTTOM = 100;
const EXPLORER_WIDTH = 280;


function extractVariables(query: string): Record<string, unknown> {
  const varRegex = /\$(\w+)\s*:\s*([^\s,)!]+)/g;
  const result: Record<string, unknown> = {};
  let match;
  while ((match = varRegex.exec(query)) !== null) {
    const [, name, rawType] = match;
    if (!name || !rawType) continue;
    const base = rawType.replace(/[!\[\]]/g, "");
    if (base === "Int" || base === "Float") result[name] = 0;
    else if (base === "Boolean") result[name] = false;
    else result[name] = "";
  }
  return result;
}

interface GraphQLBuilderProps {
  url: string;
  graphqlQuery: string;
  graphqlVariables: string;
  headers: KeyValuePair[];
  authType: AuthType;
  bearerToken: string;
  basicUsername: string;
  basicPassword: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyPlacement: "header" | "query";
  oauthConfig: OAuthConfig;
  loading: boolean;
  response: ProxyResponse | null;
  sentRequest: SentRequestSnapshot | null;
  onUrlChange: (u: string) => void;
  onGraphqlQueryChange: (q: string) => void;
  onGraphqlVariablesChange: (v: string) => void;
  onHeadersChange: (h: KeyValuePair[]) => void;
  onAuthTypeChange: (a: AuthType) => void;
  onBearerTokenChange: (v: string) => void;
  onBasicUsernameChange: (v: string) => void;
  onBasicPasswordChange: (v: string) => void;
  onApiKeyNameChange: (v: string) => void;
  onApiKeyValueChange: (v: string) => void;
  onApiKeyPlacementChange: (v: "header" | "query") => void;
  onOAuthConfigChange: (config: OAuthConfig) => void;
  onSend: () => void;
  onSave: () => void;
  // Scripts
  preRequestScript: string;
  postResponseScript: string;
  scriptLanguage: ScriptLanguage;
  scriptResult: ScriptResult | null;
  preRequestResult: ScriptResult | null;
  onPreRequestScriptChange: (s: string) => void;
  onPostResponseScriptChange: (s: string) => void;
  onScriptLanguageChange: (lang: ScriptLanguage) => void;
  // Variable support
  environments?: Environment[];
  selectedEnvId?: string | null;
  envOverrideId?: string | null;
  collectionVariables?: Record<string, string>;
  workspaceGlobals?: Record<string, string>;
}

export default function GraphQLBuilder(props: GraphQLBuilderProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [topTab, setTopTab] = useState(0); // 0=Query, 1=Variables, 2=Scripts
  const [bottomTab, setBottomTab] = useState(0); // 0=Response, 1=Headers, 2=Auth
  const [splitRatio, setSplitRatio] = useState(0.55);
  const [dragging, setDragging] = useState(false);
  const sendButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showFloatingSend, setShowFloatingSend] = useState(false);
  const [showCodeGen, setShowCodeGen] = useState(false);

  // Schema state
  const [schema, setSchema] = useState<GQLSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [showExplorer, setShowExplorer] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; severity: "success" | "error" | "info" } | null>(null);

  const codeGenData = useMemo(() => {
    const headers: Record<string, string> = {};
    for (const h of props.headers) {
      if (h.enabled && h.key) headers[h.key] = h.value;
    }
    const authConfig: Record<string, string> = {};
    if (props.authType === "bearer") authConfig.token = props.bearerToken;
    else if (props.authType === "basic") { authConfig.username = props.basicUsername; authConfig.password = props.basicPassword; }
    else if (props.authType === "api_key") { authConfig.key = props.apiKeyName; authConfig.value = props.apiKeyValue; authConfig.placement = props.apiKeyPlacement; }
    return {
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      authConfig: Object.keys(authConfig).length > 0 ? authConfig : undefined,
    };
  }, [props.headers, props.authType, props.bearerToken, props.basicUsername, props.basicPassword, props.apiKeyName, props.apiKeyValue, props.apiKeyPlacement]);

  // Variable resolution
  const activeEnvId = props.envOverrideId ?? props.selectedEnvId ?? null;
  const activeEnv = props.environments?.find((e) => e.id === activeEnvId);
  const envVariables: EnvironmentVariable[] = activeEnv?.variables ?? [];

  const { groups: variableGroups, resolved: resolvedVariables } = useVariableGroups(
    envVariables,
    props.collectionVariables ?? {},
    props.workspaceGlobals,
  );

  const activeHeadersCount = props.headers.filter((h) => h.enabled && h.key).length;
  const hasActiveScript = (props.preRequestScript?.trim().length ?? 0) > 0 || (props.postResponseScript?.trim().length ?? 0) > 0;

  // Schema fetch
  const handleFetchSchema = useCallback(async () => {
    if (!props.url) return;
    setSchemaLoading(true);
    try {
      const headers: Record<string, string> = {};
      for (const h of props.headers) {
        if (h.enabled && h.key) headers[h.key] = h.value;
      }
      headers["Content-Type"] = "application/json";

      let authType: AuthType = props.authType;
      const authConfig: Record<string, string> = {};
      if (props.authType === "bearer") authConfig.token = props.bearerToken;
      else if (props.authType === "basic") { authConfig.username = props.basicUsername; authConfig.password = props.basicPassword; }
      else if (props.authType === "api_key") { authConfig.key = props.apiKeyName; authConfig.value = props.apiKeyValue; authConfig.placement = props.apiKeyPlacement; }
      else if (props.authType === "oauth2" && props.oauthConfig.accessToken) {
        authType = "bearer";
        authConfig.token = props.oauthConfig.accessToken;
      }

      const { data } = await proxyApi.send({
        method: "POST",
        url: props.url,
        headers,
        body: JSON.stringify({ query: INTROSPECTION_QUERY }),
        body_type: "json",
        auth_type: authType,
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
  }, [props.url, props.headers, props.authType, props.bearerToken, props.basicUsername, props.basicPassword, props.apiKeyName, props.apiKeyValue, props.apiKeyPlacement, t]);

  // Insert query from explorer
  const handleInsertQuery = useCallback((query: string, variables: string) => {
    props.onGraphqlQueryChange(query);
    if (variables && variables !== "{}") {
      props.onGraphqlVariablesChange(variables);
    }
    setTopTab(0);
    setSnack({ msg: t("graphql.queryInserted"), severity: "info" });
  }, [props.onGraphqlQueryChange, props.onGraphqlVariablesChange, t]);

  // Scaffold variables
  const handleScaffoldVariables = useCallback(() => {
    const extracted = extractVariables(props.graphqlQuery);
    if (Object.keys(extracted).length === 0) {
      setSnack({ msg: t("graphql.noVariablesFound"), severity: "info" });
      return;
    }
    let existing: Record<string, unknown> = {};
    try { existing = JSON.parse(props.graphqlVariables || "{}"); } catch { /* ignore */ }
    const merged = { ...extracted, ...existing };
    props.onGraphqlVariablesChange(JSON.stringify(merged, null, 2));
    setSnack({ msg: t("graphql.variablesScaffolded"), severity: "success" });
  }, [props.graphqlQuery, props.graphqlVariables, props.onGraphqlVariablesChange, t]);

  // Drag handle
  const handleMouseDown = useCallback(() => {
    setDragging(true);
    const onMouseMove = (e: MouseEvent) => {
      const container = document.getElementById("gql-split-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const ratio = Math.max(MIN_TOP / rect.height, Math.min(1 - MIN_BOTTOM / rect.height, y / rect.height));
      setSplitRatio(ratio);
    };
    const onMouseUp = () => {
      setDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  // Floating send button observer
  useEffect(() => {
    const target = sendButtonRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setShowFloatingSend(!entry.isIntersecting);
      },
      { root: null, rootMargin: "-56px 0px 0px 0px", threshold: 0.95 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* URL Bar */}
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", p: 1.5, pb: 1, flexShrink: 0, flexWrap: "wrap" }}>
        <Box
          sx={{
            display: "flex", alignItems: "center", gap: 0.5, px: 1.5, py: 0.5,
            borderRadius: 2, bgcolor: alpha(GQL_COLOR, 0.15), border: `1px solid ${alpha(GQL_COLOR, 0.3)}`,
            minWidth: 80, justifyContent: "center",
          }}
        >
          <Hub sx={{ fontSize: 16, color: GQL_COLOR }} />
          <Typography variant="caption" sx={{ fontWeight: 700, color: GQL_COLOR, fontSize: "0.82rem" }}>GQL</Typography>
        </Box>

        <Box sx={{ flex: "1 1 320px", minWidth: 220, border: 1, borderColor: "divider", borderRadius: 1, px: 1, py: 0.25 }}>
          <VariableValueCell
            value={props.url}
            onChange={props.onUrlChange}
            placeholder="https://api.example.com/graphql"
            resolvedVariables={resolvedVariables}
            variableGroups={variableGroups}
          />
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            ref={sendButtonRef}
            variant="contained"
            onClick={props.onSend}
            disabled={props.loading || !props.url}
            startIcon={props.loading ? <CircularProgress size={14} /> : <Send sx={{ fontSize: 16 }} />}
            sx={{
              minWidth: 100, whiteSpace: "nowrap", height: 36, borderRadius: 2, fontWeight: 600, fontSize: "0.82rem",
              background: `linear-gradient(135deg, ${GQL_COLOR} 0%, ${alpha(GQL_COLOR, 0.7)} 100%)`,
              color: isDark ? "#0b0e14" : "#fff",
              "&:hover": {
                background: `linear-gradient(135deg, ${GQL_COLOR} 0%, ${alpha(GQL_COLOR, 0.85)} 100%)`,
                boxShadow: `0 4px 16px ${alpha(GQL_COLOR, 0.35)}`,
              },
            }}
          >
            {t("graphql.send")}
          </Button>

          <Button
            variant="outlined" onClick={props.onSave} startIcon={<Save sx={{ fontSize: 16 }} />}
            sx={{ minWidth: 80, whiteSpace: "nowrap", height: 36, borderRadius: 2, fontWeight: 500, fontSize: "0.82rem" }}
          >
            {t("common.save")}
          </Button>
          <Tooltip title={t("codegen.generateCode")}>
            <IconButton onClick={() => setShowCodeGen(true)} disabled={!props.url} size="small" sx={{ height: 36, width: 36 }}>
              <Code sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("graphql.fetchSchema")}>
            <IconButton
              onClick={handleFetchSchema}
              disabled={!props.url || schemaLoading}
              size="small"
              sx={{ height: 36, width: 36 }}
            >
              {schemaLoading
                ? <CircularProgress size={16} />
                : <AccountTree sx={{ fontSize: 18, color: schema ? GQL_COLOR : "inherit" }} />
              }
            </IconButton>
          </Tooltip>
          {schema && (
            <Tooltip title={t("graphql.schemaExplorer")}>
              <IconButton
                onClick={() => setShowExplorer((v) => !v)}
                size="small"
                sx={{ height: 36, width: 36, color: showExplorer ? GQL_COLOR : "inherit" }}
              >
                <Hub sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Main area: explorer + split panels */}
      <Box sx={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {/* Schema Explorer panel */}
        {showExplorer && schema && (
          <Box
            sx={{
              width: EXPLORER_WIDTH, minWidth: EXPLORER_WIDTH, flexShrink: 0,
              borderRight: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
              overflow: "hidden",
            }}
          >
            <GQLSchemaExplorer schema={schema} onInsertQuery={handleInsertQuery} />
          </Box>
        )}

        {/* Split container */}
        <Box
          id="gql-split-container"
          sx={{
            flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0,
            px: 1.5, pb: 1, userSelect: dragging ? "none" : "auto",
          }}
        >
          {/* Top: Query + Variables + Scripts */}
          <Box sx={{ height: `calc(${splitRatio * 100}% - 4px)`, display: "flex", flexDirection: "column", minHeight: MIN_TOP }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <Tabs
                value={topTab}
                onChange={(_, v) => setTopTab(v)}
                sx={{ minHeight: 30, "& .MuiTab-root": { minHeight: 30, py: 0.5, fontSize: "0.78rem" } }}
              >
                <Tab label={t("graphql.query")} />
                <Tab
                  label={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      {t("graphql.variables")}
                      <Tooltip title={t("graphql.scaffoldVariablesTooltip")}>
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); handleScaffoldVariables(); }}
                          sx={{ p: 0.15 }}
                        >
                          <AutoFixHigh sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  }
                />
                <Tab
                  label={
                    <Badge color="secondary" variant="dot" invisible={!hasActiveScript}>
                      {t("graphql.scripts")}
                    </Badge>
                  }
                />
              </Tabs>
            </Box>
            <Box sx={{ flex: 1, border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden", minHeight: 0 }}>
              {topTab === 0 && (
                <Editor
                  language="graphql"
                  theme={isDark ? "vs-dark" : "light"}
                  value={props.graphqlQuery}
                  onChange={(v) => props.onGraphqlQueryChange(v ?? "")}
                  options={{
                    minimap: { enabled: false }, fontSize: 13, lineNumbers: "on",
                    scrollBeyondLastLine: false, wordWrap: "on", tabSize: 2, automaticLayout: true, padding: { top: 8 },
                  }}
                />
              )}
              {topTab === 1 && (
                <Editor
                  language="json"
                  theme={isDark ? "vs-dark" : "light"}
                  value={props.graphqlVariables}
                  onChange={(v) => props.onGraphqlVariablesChange(v ?? "")}
                  options={{
                    minimap: { enabled: false }, fontSize: 13, lineNumbers: "on",
                    scrollBeyondLastLine: false, wordWrap: "on", tabSize: 2, automaticLayout: true, padding: { top: 8 },
                  }}
                />
              )}
              {topTab === 2 && (
                <ScriptEditor
                  preRequestScript={props.preRequestScript}
                  postResponseScript={props.postResponseScript}
                  scriptResult={props.scriptResult}
                  preRequestResult={props.preRequestResult}
                  onPreRequestScriptChange={props.onPreRequestScriptChange}
                  onPostResponseScriptChange={props.onPostResponseScriptChange}
                  scriptLanguage={props.scriptLanguage}
                  onScriptLanguageChange={props.onScriptLanguageChange}
                  variableGroups={variableGroups}
                  resolvedVariables={resolvedVariables}
                />
              )}
            </Box>
          </Box>

          {/* Drag handle */}
          <Box
            onMouseDown={handleMouseDown}
            sx={{
              height: 8, display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "row-resize", flexShrink: 0, "&:hover .drag-icon": { opacity: 1 },
            }}
          >
            <DragHandle className="drag-icon" sx={{ fontSize: 16, color: "text.disabled", opacity: 0.5, transition: "opacity 0.15s" }} />
          </Box>

          {/* Bottom: Response + Headers + Auth */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: MIN_BOTTOM }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Tabs
                value={bottomTab}
                onChange={(_, v) => setBottomTab(v)}
                sx={{ minHeight: 30, "& .MuiTab-root": { minHeight: 30, py: 0.5, fontSize: "0.78rem" } }}
              >
                <Tab
                  label={
                    props.response ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        {t("response.body")}
                        <Box
                          component="span"
                          sx={{
                            px: 0.75, py: 0.1, borderRadius: 1, fontSize: "0.7rem", fontWeight: 700,
                            bgcolor: props.response.status_code < 300 ? alpha("#22c55e", 0.15) : props.response.status_code < 400 ? alpha("#f59e0b", 0.15) : alpha("#ef4444", 0.15),
                            color: props.response.status_code < 300 ? "#22c55e" : props.response.status_code < 400 ? "#f59e0b" : "#ef4444",
                          }}
                        >
                          {props.response.status_code}
                        </Box>
                        <Typography variant="caption" sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                          {props.response.elapsed_ms.toFixed(0)}ms
                        </Typography>
                      </Box>
                    ) : t("response.body")
                  }
                />
                <Tab
                  label={
                    <Badge badgeContent={activeHeadersCount} color="primary" sx={{ "& .MuiBadge-badge": { fontSize: 10, minWidth: 16, height: 16 } }}>
                      {t("request.headers")}
                    </Badge>
                  }
                />
                <Tab label={t("request.auth")} />
              </Tabs>
            </Box>

            <Box sx={{ flex: 1, overflow: "auto", mt: 0.5, minHeight: 0 }}>
              {bottomTab === 0 && (
                <ResponsePanel response={props.response} sentRequest={props.sentRequest} />
              )}
              {bottomTab === 1 && (
                <KeyValueEditor
                  pairs={props.headers}
                  onChange={props.onHeadersChange}
                  keyLabel={t("request.header")}
                  valueLabel={t("common.value")}
                  resolvedVariables={resolvedVariables}
                  variableGroups={variableGroups}
                />
              )}
              {bottomTab === 2 && (
                <AuthEditor
                  authType={props.authType}
                  bearerToken={props.bearerToken}
                  basicUsername={props.basicUsername}
                  basicPassword={props.basicPassword}
                  apiKeyName={props.apiKeyName}
                  apiKeyValue={props.apiKeyValue}
                  apiKeyPlacement={props.apiKeyPlacement}
                  onAuthTypeChange={props.onAuthTypeChange}
                  onBearerTokenChange={props.onBearerTokenChange}
                  onBasicUsernameChange={props.onBasicUsernameChange}
                  onBasicPasswordChange={props.onBasicPasswordChange}
                  onApiKeyNameChange={props.onApiKeyNameChange}
                  onApiKeyValueChange={props.onApiKeyValueChange}
                  onApiKeyPlacementChange={props.onApiKeyPlacementChange}
                  oauthConfig={props.oauthConfig}
                  onOAuthConfigChange={props.onOAuthConfigChange}
                  resolvedVariables={resolvedVariables}
                  variableGroups={variableGroups}
                />
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Floating send */}
      {showFloatingSend && (
        <Portal>
          <Button
            variant="contained" onClick={props.onSend} disabled={props.loading || !props.url}
            startIcon={props.loading ? <CircularProgress size={14} /> : <Send sx={{ fontSize: 16 }} />}
            sx={{
              position: "fixed", right: 24, bottom: 24, zIndex: theme.zIndex.modal + 1, borderRadius: 999,
              px: 2.25, py: 1, fontWeight: 700, fontSize: "0.9rem",
              background: `linear-gradient(135deg, ${GQL_COLOR} 0%, ${alpha(GQL_COLOR, 0.7)} 100%)`,
              color: isDark ? "#0b0e14" : "#fff",
              boxShadow: `0 12px 30px ${alpha(GQL_COLOR, 0.35)}`,
              "&:hover": { background: `linear-gradient(135deg, ${GQL_COLOR} 0%, ${alpha(GQL_COLOR, 0.85)} 100%)`, boxShadow: `0 14px 36px ${alpha(GQL_COLOR, 0.45)}` },
            }}
          >
            {t("graphql.send")}
          </Button>
        </Portal>
      )}

      <CodeGenDialog
        open={showCodeGen} onClose={() => setShowCodeGen(false)}
        method="POST" url={props.url} headers={codeGenData.headers}
        body={JSON.stringify({ query: props.graphqlQuery, variables: props.graphqlVariables || undefined })}
        bodyType="json" authType={props.authType} authConfig={codeGenData.authConfig}
      />

      <Snackbar open={!!snack} autoHideDuration={3000} onClose={() => setSnack(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={snack?.severity ?? "info"} onClose={() => setSnack(null)} sx={{ minWidth: 250 }}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
