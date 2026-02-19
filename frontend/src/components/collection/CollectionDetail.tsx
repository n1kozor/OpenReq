import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Tabs,
  Tab,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  ToggleButtonGroup,
  ToggleButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  Save,
  Add,
  DeleteOutline,
  Lock,
  Public,
  Folder,
  Description,
  Http,
  PlayArrow,
  Edit as EditIcon,
  Visibility,
  Assessment,
  Delete,
  IosShare,
} from "@mui/icons-material";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import AuthEditor from "@/components/request/AuthEditor";
import { VariableValueCell } from "@/components/common/KeyValueEditor";
import RunReportView from "./RunReportView";
import { runsApi } from "@/api/endpoints";
import { formatMs } from "./runnerUtils";
import ShareManageDialog from "@/components/share/ShareManageDialog";
import type { Collection, CollectionItem, AuthType, OAuthConfig, ScriptLanguage, CollectionRunSummary } from "@/types";
import type { VariableInfo, VariableGroup } from "@/hooks/useVariableGroups";

interface VarRow {
  key: string;
  value: string;
}

interface CollectionDetailProps {
  collection: Collection;
  collectionTree: CollectionItem[];
  onSave: (data: {
    name: string;
    description: string;
    visibility: "private" | "shared";
    variables: Record<string, string>;
    auth_type: AuthType | null;
    auth_config: Record<string, string> | null;
    pre_request_script: string | null;
    post_response_script: string | null;
    script_language: string | null;
  }) => Promise<void>;
  onDirtyChange: (isDirty: boolean) => void;
  onRunCollection: (collectionId: string) => void;
  resolvedVariables?: Map<string, VariableInfo>;
  variableGroups?: VariableGroup[];
}

function countItems(tree: CollectionItem[]): { requests: number; folders: number } {
  let requests = 0;
  let folders = 0;
  const walk = (nodes: CollectionItem[]) => {
    for (const node of nodes) {
      if (node.is_folder) {
        folders++;
      } else {
        requests++;
      }
      if (node.children?.length) walk(node.children);
    }
  };
  walk(tree);
  return { requests, folders };
}

export default function CollectionDetail({
  collection,
  collectionTree,
  onSave,
  onDirtyChange,
  onRunCollection,
  resolvedVariables,
  variableGroups,
}: CollectionDetailProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [activeTab, setActiveTab] = useState(0);
  const [name, setName] = useState(collection.name);
  const [description, setDescription] = useState(collection.description || "");
  const [visibility, setVisibility] = useState<"private" | "shared">(collection.visibility);
  const [vars, setVars] = useState<VarRow[]>([{ key: "", value: "" }]);
  const [authType, setAuthType] = useState<AuthType>(
    (collection.auth_type as AuthType) || "none"
  );
  const [bearerToken, setBearerToken] = useState(
    collection.auth_config?.token || ""
  );
  const [basicUsername, setBasicUsername] = useState(
    collection.auth_config?.username || ""
  );
  const [basicPassword, setBasicPassword] = useState(
    collection.auth_config?.password || ""
  );
  const [apiKeyName, setApiKeyName] = useState(
    collection.auth_config?.key || "X-API-Key"
  );
  const [apiKeyValue, setApiKeyValue] = useState(
    collection.auth_config?.value || ""
  );
  const [apiKeyPlacement, setApiKeyPlacement] = useState<"header" | "query">(
    (collection.auth_config?.placement as "header" | "query") || "header"
  );
  const [oauthConfig, setOauthConfig] = useState<OAuthConfig>({
    grantType: "authorization_code",
    authUrl: "",
    tokenUrl: "",
    clientId: "",
    clientSecret: "",
    redirectUri: "http://localhost:5173/oauth/callback",
    scope: "",
    usePkce: false,
    accessToken: collection.auth_config?.token || collection.auth_config?.access_token || "",
  });
  const [saving, setSaving] = useState(false);
  const [descriptionMode, setDescriptionMode] = useState<"write" | "preview">("preview");

  // Runs tab state
  const [runs, setRuns] = useState<CollectionRunSummary[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [deleteRunConfirm, setDeleteRunConfirm] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [preRequestScript, setPreRequestScript] = useState(collection.pre_request_script || "");
  const [postResponseScript, setPostResponseScript] = useState(collection.post_response_script || "");
  const [scriptLanguage, setScriptLanguage] = useState<ScriptLanguage>(
    (collection.script_language as ScriptLanguage) || "python"
  );

  // Sync with collection prop
  useEffect(() => {
    setName(collection.name);
    setDescription(collection.description || "");
    setVisibility(collection.visibility);
    const entries = Object.entries(collection.variables || {});
    setVars(
      entries.length > 0
        ? [...entries.map(([key, value]) => ({ key, value })), { key: "", value: "" }]
        : [{ key: "", value: "" }]
    );
    // Sync auth
    const at = (collection.auth_type as AuthType) || "none";
    setAuthType(at);
    const cfg = collection.auth_config || {};
    setBearerToken(cfg.token || "");
    setBasicUsername(cfg.username || "");
    setBasicPassword(cfg.password || "");
    setApiKeyName(cfg.key || "X-API-Key");
    setApiKeyValue(cfg.value || "");
    setApiKeyPlacement((cfg.placement as "header" | "query") || "header");
    setOauthConfig((prev) => ({
      ...prev,
      accessToken: cfg.token || cfg.access_token || "",
    }));
    // Sync scripts
    setPreRequestScript(collection.pre_request_script || "");
    setPostResponseScript(collection.post_response_script || "");
    setScriptLanguage((collection.script_language as ScriptLanguage) || "python");
  }, [collection.id]);

  // Build current auth config from state
  const buildAuthConfig = (): Record<string, string> | null => {
    if (authType === "none") return null;
    if (authType === "bearer") return { token: bearerToken };
    if (authType === "basic") return { username: basicUsername, password: basicPassword };
    if (authType === "api_key") return { key: apiKeyName, value: apiKeyValue, placement: apiKeyPlacement };
    if (authType === "oauth2") return { token: oauthConfig.accessToken };
    return null;
  };

  // Track dirty state
  const isDirty = useMemo(() => {
    if (name !== collection.name) return true;
    if (description !== (collection.description || "")) return true;
    if (visibility !== collection.visibility) return true;
    const currentVars: Record<string, string> = {};
    for (const v of vars) {
      if (v.key.trim()) currentVars[v.key.trim()] = v.value;
    }
    const origVars = collection.variables || {};
    if (JSON.stringify(currentVars) !== JSON.stringify(origVars)) return true;
    // Auth dirty check
    const origAuthType = collection.auth_type || "none";
    if (authType !== origAuthType) return true;
    if (JSON.stringify(buildAuthConfig()) !== JSON.stringify(collection.auth_config || null)) return true;
    if (preRequestScript !== (collection.pre_request_script || "")) return true;
    if (postResponseScript !== (collection.post_response_script || "")) return true;
    if (scriptLanguage !== ((collection.script_language as ScriptLanguage) || "python")) return true;
    return false;
  }, [name, description, visibility, vars, collection, authType, bearerToken, basicUsername, basicPassword, apiKeyName, apiKeyValue, apiKeyPlacement, oauthConfig.accessToken, preRequestScript, postResponseScript, scriptLanguage]);

  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  useEffect(() => {
    onDirtyChangeRef.current(isDirty);
  }, [isDirty]);

  const stats = useMemo(() => countItems(collectionTree), [collectionTree]);

  // Fetch runs when Runs tab is activated
  useEffect(() => {
    if (activeTab === 5) {
      setLoadingRuns(true);
      runsApi
        .list(collection.id)
        .then((res) => setRuns(res.data))
        .catch(() => {})
        .finally(() => setLoadingRuns(false));
    }
  }, [activeTab, collection.id]);

  const handleDeleteRun = useCallback(async (runId: string) => {
    try {
      await runsApi.delete(runId);
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch { /* ignore */ }
    setDeleteRunConfirm(null);
  }, []);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const variables: Record<string, string> = {};
      for (const v of vars) {
        if (v.key.trim()) variables[v.key.trim()] = v.value;
      }
      await onSave({
        name: name.trim(),
        description: description.trim(),
        visibility,
        variables,
        auth_type: authType === "none" ? null : authType,
        auth_config: buildAuthConfig(),
        pre_request_script: preRequestScript.trim() || null,
        post_response_script: postResponseScript.trim() || null,
        script_language: scriptLanguage,
      });
    } finally {
      setSaving(false);
    }
  };

  const updateVar = (index: number, field: "key" | "value", val: string) => {
    setVars((prev) => {
      const next = [...prev];
      const cur = next[index] ?? { key: "", value: "" };
      next[index] = { key: cur.key, value: cur.value, [field]: val };
      if (index === next.length - 1 && val.trim()) {
        next.push({ key: "", value: "" });
      }
      return next;
    });
  };

  const removeVar = (index: number) => {
    setVars((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length === 0 ? [{ key: "", value: "" }] : next;
    });
  };

  const sectionPaper = {
    p: 2.5,
    borderRadius: 2,
    backgroundColor: alpha(theme.palette.background.paper, isDark ? 0.6 : 0.9),
    border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
  };

  return (
    <Box
      sx={{
        flexGrow: 1,
        overflow: "auto",
        p: 3,
        width: "100%",
      }}
    >
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <TextField
            value={name}
            onChange={(e) => setName(e.target.value)}
            variant="standard"
            fullWidth
            InputProps={{
              disableUnderline: true,
              sx: {
                fontSize: "1.75rem",
                fontWeight: 700,
                letterSpacing: "-0.01em",
                "&:hover": {
                  backgroundColor: alpha(theme.palette.text.primary, 0.03),
                },
                "&.Mui-focused": {
                  backgroundColor: alpha(theme.palette.text.primary, 0.05),
                },
                borderRadius: 1,
                px: 1,
                py: 0.5,
              },
            }}
          />
          <Box sx={{ display: "flex", gap: 1, mt: 1, ml: 1, alignItems: "center" }}>
            <Chip
              icon={visibility === "private" ? <Lock sx={{ fontSize: 14 }} /> : <Public sx={{ fontSize: 14 }} />}
              label={visibility === "private" ? t("collection.private") : t("collection.shared")}
              size="small"
              variant="outlined"
              sx={{ fontSize: "0.7rem", height: 24 }}
            />
            <Chip
              icon={<Http sx={{ fontSize: 14 }} />}
              label={t("collectionDetail.requestCount", { count: stats.requests })}
              size="small"
              variant="outlined"
              color="primary"
              sx={{ fontSize: "0.7rem", height: 24 }}
            />
            <Chip
              icon={<Folder sx={{ fontSize: 14 }} />}
              label={t("collectionDetail.folderCount", { count: stats.folders })}
              size="small"
              variant="outlined"
              sx={{ fontSize: "0.7rem", height: 24 }}
            />
          </Box>
        </Box>
        <Box sx={{ display: "flex", gap: 1, ml: 2, flexShrink: 0 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<IosShare />}
            onClick={() => setShowShareDialog(true)}
            sx={{ textTransform: "none" }}
          >
            {t("share.title")}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PlayArrow />}
            onClick={() => onRunCollection(collection.id)}
            sx={{ textTransform: "none" }}
          >
            {t("collection.run")}
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<Save />}
            onClick={handleSave}
            disabled={!isDirty || !name.trim() || saving}
            sx={{ textTransform: "none" }}
          >
            {t("common.save")}
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{
          minHeight: 36,
          mb: 2.5,
          "& .MuiTab-root": { minHeight: 36, textTransform: "none", fontSize: "0.85rem" },
        }}
      >
        <Tab label={t("collectionDetail.overview")} />
        <Tab label={t("collection.variables")} />
        <Tab label={t("collectionDetail.authorization")} />
        <Tab label={t("collectionDetail.preRequestScript")} />
        <Tab label={t("collectionDetail.tests")} />
        <Tab label={t("runner.runs")} />
      </Tabs>

      {/* Overview Tab */}
      {activeTab === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          {/* Description */}
          <Paper variant="outlined" sx={sectionPaper}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Description sx={{ fontSize: 18 }} />
                {t("collection.description")}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                  {t("collectionDetail.markdownSupported")}
                </Typography>
                <ToggleButtonGroup
                  value={descriptionMode}
                  exclusive
                  onChange={(_, v) => v && setDescriptionMode(v)}
                  size="small"
                  sx={{ "& .MuiToggleButton-root": { px: 1.5, py: 0.25, fontSize: "0.75rem", textTransform: "none" } }}
                >
                  <ToggleButton value="write">
                    <EditIcon sx={{ fontSize: 14, mr: 0.5 }} />
                    {t("collectionDetail.write")}
                  </ToggleButton>
                  <ToggleButton value="preview">
                    <Visibility sx={{ fontSize: 14, mr: 0.5 }} />
                    {t("collectionDetail.preview")}
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Box>
            {descriptionMode === "write" ? (
              <TextField
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                multiline
                minRows={6}
                maxRows={20}
                fullWidth
                placeholder={t("collectionDetail.noDescription")}
                variant="outlined"
                size="small"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    fontSize: "0.875rem",
                    fontFamily: "monospace",
                    backgroundColor: alpha(theme.palette.background.default, 0.5),
                  },
                }}
              />
            ) : (
              <Box
                onClick={() => setDescriptionMode("write")}
                sx={{
                  minHeight: 120,
                  p: 2,
                  borderRadius: 1,
                  border: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
                  backgroundColor: alpha(theme.palette.background.default, 0.5),
                  cursor: "pointer",
                  "&:hover": {
                    borderColor: alpha(theme.palette.primary.main, 0.3),
                  },
                  // Markdown styling
                  "& h1": { fontSize: "1.5rem", fontWeight: 700, mt: 0, mb: 1 },
                  "& h2": { fontSize: "1.25rem", fontWeight: 600, mt: 2, mb: 1 },
                  "& h3": { fontSize: "1.1rem", fontWeight: 600, mt: 1.5, mb: 0.75 },
                  "& p": { fontSize: "0.875rem", lineHeight: 1.7, my: 0.75, color: "text.primary" },
                  "& ul, & ol": { fontSize: "0.875rem", pl: 2.5, my: 0.75 },
                  "& li": { mb: 0.25 },
                  "& code": {
                    fontSize: "0.8rem",
                    fontFamily: "monospace",
                    backgroundColor: alpha(theme.palette.text.primary, 0.06),
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 0.5,
                  },
                  "& pre": {
                    backgroundColor: alpha(theme.palette.text.primary, 0.06),
                    p: 1.5,
                    borderRadius: 1,
                    overflow: "auto",
                    my: 1,
                    "& code": { backgroundColor: "transparent", p: 0 },
                  },
                  "& a": { color: "primary.main", textDecoration: "none", "&:hover": { textDecoration: "underline" } },
                  "& blockquote": {
                    borderLeft: `3px solid ${alpha(theme.palette.primary.main, 0.4)}`,
                    pl: 2,
                    ml: 0,
                    my: 1,
                    color: "text.secondary",
                  },
                  "& table": {
                    borderCollapse: "collapse",
                    width: "100%",
                    my: 1,
                    fontSize: "0.85rem",
                  },
                  "& th, & td": {
                    border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
                    px: 1.5,
                    py: 0.75,
                    textAlign: "left",
                  },
                  "& th": {
                    backgroundColor: alpha(theme.palette.text.primary, 0.04),
                    fontWeight: 600,
                  },
                  "& hr": {
                    border: "none",
                    borderTop: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
                    my: 2,
                  },
                  "& img": { maxWidth: "100%", borderRadius: 1 },
                }}
              >
                {description.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                    {t("collectionDetail.noDescription")}
                  </Typography>
                )}
              </Box>
            )}
          </Paper>

          {/* Settings */}
          <Paper variant="outlined" sx={sectionPaper}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
              {t("collectionDetail.settings")}
            </Typography>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>{t("collection.visibility")}</InputLabel>
              <Select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as "private" | "shared")}
                label={t("collection.visibility")}
              >
                <MenuItem value="private">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Lock sx={{ fontSize: 16 }} />
                    {t("collection.private")}
                  </Box>
                </MenuItem>
                <MenuItem value="shared">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Public sx={{ fontSize: 16 }} />
                    {t("collection.shared")}
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>
          </Paper>
        </Box>
      )}

      {/* Variables Tab */}
      {activeTab === 1 && (
        <Paper variant="outlined" sx={sectionPaper}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
            {t("collection.variablesHint")}
          </Typography>

          {/* Variable header */}
          <Box sx={{ display: "flex", gap: 1, mb: 1, px: 0.5 }}>
            <Typography variant="caption" fontWeight={600} sx={{ flex: 1, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary" }}>
              {t("environment.key")}
            </Typography>
            <Typography variant="caption" fontWeight={600} sx={{ flex: 1, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary" }}>
              {t("common.value")}
            </Typography>
            <Box sx={{ width: 32 }} />
          </Box>

          <Divider sx={{ mb: 1 }} />

          {vars.map((v, i) => (
            <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "center", mb: 0.75 }}>
              <TextField
                size="small"
                placeholder={t("environment.key")}
                value={v.key}
                onChange={(e) => updateVar(i, "key", e.target.value)}
                sx={{
                  flex: 1,
                  "& .MuiOutlinedInput-root": {
                    fontSize: "0.8rem",
                    backgroundColor: alpha(theme.palette.background.default, 0.5),
                  },
                }}
              />
              <Box sx={{ flex: 1 }}>
                <VariableValueCell
                  value={v.value}
                  onChange={(val) => updateVar(i, "value", val)}
                  placeholder={t("common.value")}
                  resolvedVariables={resolvedVariables}
                  variableGroups={variableGroups}
                />
              </Box>
              <IconButton
                size="small"
                onClick={() => removeVar(i)}
                disabled={vars.length === 1 && !v.key}
                sx={{ width: 32, height: 32 }}
              >
                <DeleteOutline sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          ))}

          <Button
            size="small"
            startIcon={<Add sx={{ fontSize: 14 }} />}
            onClick={() => setVars((prev) => [...prev, { key: "", value: "" }])}
            sx={{ mt: 1, textTransform: "none", fontSize: "0.8rem" }}
          >
            {t("collection.addVariable")}
          </Button>
        </Paper>
      )}

      {/* Authorization Tab */}
      {activeTab === 2 && (
        <Paper variant="outlined" sx={sectionPaper}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
            {t("collectionDetail.authDescription")}
          </Typography>
          <AuthEditor
            authType={authType}
            bearerToken={bearerToken}
            basicUsername={basicUsername}
            basicPassword={basicPassword}
            apiKeyName={apiKeyName}
            apiKeyValue={apiKeyValue}
            apiKeyPlacement={apiKeyPlacement}
            oauthConfig={oauthConfig}
            onAuthTypeChange={setAuthType}
            onBearerTokenChange={setBearerToken}
            onBasicUsernameChange={setBasicUsername}
            onBasicPasswordChange={setBasicPassword}
            onApiKeyNameChange={setApiKeyName}
            onApiKeyValueChange={setApiKeyValue}
            onApiKeyPlacementChange={setApiKeyPlacement}
            onOAuthConfigChange={setOauthConfig}
            resolvedVariables={resolvedVariables}
            variableGroups={variableGroups}
          />
        </Paper>
      )}

      {/* Pre-request Script Tab */}
      {activeTab === 3 && (
        <Paper variant="outlined" sx={sectionPaper}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              {t("collectionDetail.preRequestDescription")}
            </Typography>
            <ToggleButtonGroup
              value={scriptLanguage}
              exclusive
              onChange={(_, v) => v && setScriptLanguage(v)}
              size="small"
              sx={{ "& .MuiToggleButton-root": { px: 1.5, py: 0.25, fontSize: "0.7rem", textTransform: "none" } }}
            >
              <ToggleButton value="python">Python</ToggleButton>
              <ToggleButton value="javascript">JavaScript</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box sx={{ border: `1px solid ${alpha(theme.palette.divider, 0.15)}`, borderRadius: 1, overflow: "hidden" }}>
            <Editor
              height="300px"
              language={scriptLanguage === "javascript" ? "javascript" : "python"}
              theme={isDark ? "vs-dark" : "light"}
              value={preRequestScript}
              onChange={(v) => setPreRequestScript(v || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                tabSize: 2,
                padding: { top: 8 },
              }}
            />
          </Box>
        </Paper>
      )}

      {/* Post-response Script (Tests) Tab */}
      {activeTab === 4 && (
        <Paper variant="outlined" sx={sectionPaper}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              {t("collectionDetail.testsDescription")}
            </Typography>
            <ToggleButtonGroup
              value={scriptLanguage}
              exclusive
              onChange={(_, v) => v && setScriptLanguage(v)}
              size="small"
              sx={{ "& .MuiToggleButton-root": { px: 1.5, py: 0.25, fontSize: "0.7rem", textTransform: "none" } }}
            >
              <ToggleButton value="python">Python</ToggleButton>
              <ToggleButton value="javascript">JavaScript</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box sx={{ border: `1px solid ${alpha(theme.palette.divider, 0.15)}`, borderRadius: 1, overflow: "hidden" }}>
            <Editor
              height="300px"
              language={scriptLanguage === "javascript" ? "javascript" : "python"}
              theme={isDark ? "vs-dark" : "light"}
              value={postResponseScript}
              onChange={(v) => setPostResponseScript(v || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                tabSize: 2,
                padding: { top: 8 },
              }}
            />
          </Box>
        </Paper>
      )}

      {/* Runs Tab */}
      {activeTab === 5 && (
        <Paper variant="outlined" sx={sectionPaper}>
          {loadingRuns ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : runs.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 6 }}>
              <Assessment sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {t("runner.noRuns")}
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{t("runner.runDate")}</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{t("runner.runStatus")}</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{t("runner.environment")}</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{t("runner.totalRequests")}</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{t("runner.tests")}</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>{t("runner.duration")}</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 100 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {runs.map((run) => {
                    const statusColor =
                      run.status === "completed"
                        ? theme.palette.success.main
                        : run.status === "stopped"
                        ? theme.palette.warning.main
                        : theme.palette.error.main;
                    return (
                      <TableRow
                        key={run.id}
                        hover
                        sx={{ cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        <TableCell sx={{ fontSize: "0.8rem" }}>
                          {new Date(run.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={t(`runner.${run.status}`)}
                            size="small"
                            sx={{
                              height: 22,
                              fontWeight: 700,
                              fontSize: "0.68rem",
                              bgcolor: alpha(statusColor, 0.12),
                              color: statusColor,
                              border: `1px solid ${alpha(statusColor, 0.3)}`,
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.8rem" }}>
                          {run.environment_name || "—"}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.8rem" }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            <span style={{ color: theme.palette.success.main }}>{run.passed_count}</span>
                            {" / "}
                            <span>{run.total_requests}</span>
                            {run.failed_count > 0 && (
                              <Chip
                                label={`${run.failed_count} err`}
                                size="small"
                                color="error"
                                variant="outlined"
                                sx={{ height: 18, fontSize: "0.6rem", ml: 0.5 }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.8rem" }}>
                          {run.total_tests > 0 ? (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                              <span style={{ color: theme.palette.success.main }}>{run.passed_tests}</span>
                              {" / "}
                              <span>{run.total_tests}</span>
                            </Box>
                          ) : (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.8rem", fontFamily: "monospace" }}>
                          {formatMs(run.total_time_ms)}
                        </TableCell>
                        <TableCell>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteRunConfirm(run.id);
                            }}
                            sx={{ width: 28, height: 28 }}
                          >
                            <Delete sx={{ fontSize: 16 }} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Report viewer dialog */}
          {selectedRunId && (
            <RunReportView
              runId={selectedRunId}
              open={!!selectedRunId}
              onClose={() => setSelectedRunId(null)}
            />
          )}

          {/* Delete confirmation dialog */}
          <Dialog
            open={!!deleteRunConfirm}
            onClose={() => setDeleteRunConfirm(null)}
            maxWidth="xs"
            fullWidth
          >
            <DialogTitle sx={{ fontSize: "1rem" }}>{t("runner.deleteRun")}</DialogTitle>
            <DialogContent>
              <Typography variant="body2">{t("runner.deleteRunConfirm")}</Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteRunConfirm(null)} sx={{ textTransform: "none" }}>
                {t("common.cancel")}
              </Button>
              <Button
                color="error"
                variant="contained"
                onClick={() => deleteRunConfirm && handleDeleteRun(deleteRunConfirm)}
                sx={{ textTransform: "none" }}
              >
                {t("common.delete")}
              </Button>
            </DialogActions>
          </Dialog>
        </Paper>
      )}
      {/* Share Dialog */}
      <ShareManageDialog
        open={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        collectionId={collection.id}
        collectionName={collection.name}
      />
    </Box>
  );
}
