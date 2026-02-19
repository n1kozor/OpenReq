import { useState, useEffect, useMemo, useRef } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Tabs,
  Tab,
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
} from "@mui/material";
import {
  Save,
  Add,
  DeleteOutline,
  Description,
  Edit as EditIcon,
  Visibility,
  IosShare,
} from "@mui/icons-material";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import AuthEditor from "@/components/request/AuthEditor";
import { VariableValueCell } from "@/components/common/KeyValueEditor";
import type { CollectionItem, AuthType, OAuthConfig, ScriptLanguage } from "@/types";
import type { VariableInfo, VariableGroup } from "@/hooks/useVariableGroups";

interface VarRow {
  key: string;
  value: string;
}

interface FolderDetailProps {
  folder: CollectionItem;
  collectionId?: string;
  onSave: (data: {
    name: string;
    description: string | null;
    variables: Record<string, string> | null;
    auth_type: AuthType | null;
    auth_config: Record<string, string> | null;
    pre_request_script: string | null;
    post_response_script: string | null;
    script_language: string | null;
  }) => Promise<void>;
  onDirtyChange: (isDirty: boolean) => void;
  onShareDocs?: (collectionId: string, collectionName: string, folderId: string, folderName: string) => void;
  resolvedVariables?: Map<string, VariableInfo>;
  variableGroups?: VariableGroup[];
}

export default function FolderDetail({
  folder,
  collectionId,
  onSave,
  onDirtyChange,
  onShareDocs,
  resolvedVariables,
  variableGroups,
}: FolderDetailProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [activeTab, setActiveTab] = useState(0);
  const [name, setName] = useState(folder.name);
  const [description, setDescription] = useState(folder.description || "");
  const [vars, setVars] = useState<VarRow[]>([{ key: "", value: "" }]);
  const [authType, setAuthType] = useState<AuthType>(
    (folder.auth_type as AuthType) || "inherit"
  );
  const [bearerToken, setBearerToken] = useState(
    folder.auth_config?.bearer_token || folder.auth_config?.token || ""
  );
  const [basicUsername, setBasicUsername] = useState(
    folder.auth_config?.username || ""
  );
  const [basicPassword, setBasicPassword] = useState(
    folder.auth_config?.password || ""
  );
  const [apiKeyName, setApiKeyName] = useState(
    folder.auth_config?.api_key_name || folder.auth_config?.key || "X-API-Key"
  );
  const [apiKeyValue, setApiKeyValue] = useState(
    folder.auth_config?.api_key_value || folder.auth_config?.value || ""
  );
  const [apiKeyPlacement, setApiKeyPlacement] = useState<"header" | "query">(
    (folder.auth_config?.api_key_placement as "header" | "query") ||
      (folder.auth_config?.placement as "header" | "query") ||
      "header"
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
    accessToken: folder.auth_config?.access_token || folder.auth_config?.token || "",
  });
  const [saving, setSaving] = useState(false);
  const [descriptionMode, setDescriptionMode] = useState<"write" | "preview">("preview");
  const [preRequestScript, setPreRequestScript] = useState(folder.pre_request_script || "");
  const [postResponseScript, setPostResponseScript] = useState(folder.post_response_script || "");
  const [scriptLanguage, setScriptLanguage] = useState<ScriptLanguage>(
    (folder.script_language as ScriptLanguage) || "python"
  );

  // Sync with folder prop
  useEffect(() => {
    setName(folder.name);
    setDescription(folder.description || "");
    const entries = Object.entries(folder.variables || {});
    setVars(
      entries.length > 0
        ? [...entries.map(([key, value]) => ({ key, value })), { key: "", value: "" }]
        : [{ key: "", value: "" }]
    );
    const at = (folder.auth_type as AuthType) || "inherit";
    setAuthType(at);
    const cfg = folder.auth_config || {};
    setBearerToken(cfg.bearer_token || cfg.token || "");
    setBasicUsername(cfg.username || "");
    setBasicPassword(cfg.password || "");
    setApiKeyName(cfg.api_key_name || cfg.key || "X-API-Key");
    setApiKeyValue(cfg.api_key_value || cfg.value || "");
    setApiKeyPlacement((cfg.api_key_placement as "header" | "query") || (cfg.placement as "header" | "query") || "header");
    if (at === "oauth2") {
      setOauthConfig({
        grantType: (cfg.grant_type as OAuthConfig["grantType"]) || "authorization_code",
        authUrl: cfg.auth_url || "",
        tokenUrl: cfg.token_url || "",
        clientId: cfg.client_id || "",
        clientSecret: cfg.client_secret || "",
        redirectUri: cfg.redirect_uri || "http://localhost:5173/oauth/callback",
        scope: cfg.scope || "",
        usePkce: cfg.use_pkce === "true",
        accessToken: cfg.access_token || "",
      });
    }
    setPreRequestScript(folder.pre_request_script || "");
    setPostResponseScript(folder.post_response_script || "");
    setScriptLanguage((folder.script_language as ScriptLanguage) || "python");
  }, [folder.id]);

  const buildAuthConfig = (): Record<string, string> | null => {
    if (authType === "none" || authType === "inherit") return null;
    if (authType === "bearer") return { bearer_token: bearerToken };
    if (authType === "basic") return { username: basicUsername, password: basicPassword };
    if (authType === "api_key")
      return { api_key_name: apiKeyName, api_key_value: apiKeyValue, api_key_placement: apiKeyPlacement };
    if (authType === "oauth2") {
      return {
        grant_type: oauthConfig.grantType,
        auth_url: oauthConfig.authUrl,
        token_url: oauthConfig.tokenUrl,
        client_id: oauthConfig.clientId,
        client_secret: oauthConfig.clientSecret,
        redirect_uri: oauthConfig.redirectUri,
        scope: oauthConfig.scope,
        use_pkce: String(oauthConfig.usePkce),
        access_token: oauthConfig.accessToken,
      };
    }
    return null;
  };

  const isDirty = useMemo(() => {
    if (name !== folder.name) return true;
    if (description !== (folder.description || "")) return true;
    const currentVars: Record<string, string> = {};
    for (const v of vars) {
      if (v.key.trim()) currentVars[v.key.trim()] = v.value;
    }
    const origVars = folder.variables || {};
    if (JSON.stringify(currentVars) !== JSON.stringify(origVars)) return true;
    const origAuthType = folder.auth_type || "inherit";
    if (authType !== origAuthType) return true;
    if (JSON.stringify(buildAuthConfig()) !== JSON.stringify(folder.auth_config || null)) return true;
    if (preRequestScript !== (folder.pre_request_script || "")) return true;
    if (postResponseScript !== (folder.post_response_script || "")) return true;
    if (scriptLanguage !== ((folder.script_language as ScriptLanguage) || "python")) return true;
    return false;
  }, [name, description, vars, folder, authType, bearerToken, basicUsername, basicPassword, apiKeyName, apiKeyValue, apiKeyPlacement, oauthConfig, preRequestScript, postResponseScript, scriptLanguage]);

  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  useEffect(() => {
    onDirtyChangeRef.current(isDirty);
  }, [isDirty]);

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
        description: description.trim() || null,
        variables: Object.keys(variables).length > 0 ? variables : null,
        auth_type: authType === "inherit" ? "inherit" : authType === "none" ? null : authType,
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
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", p: 3 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box sx={{ flex: 1, mr: 2 }}>
          <TextField
            value={name}
            onChange={(e) => setName(e.target.value)}
            variant="standard"
            fullWidth
            placeholder={t("folder.name")}
            slotProps={{
              input: {
                sx: {
                  fontSize: "1.4rem",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                },
                disableUnderline: !name,
              },
            }}
          />
        </Box>
        {onShareDocs && collectionId && (
          <Button
            variant="outlined"
            startIcon={<IosShare />}
            onClick={() => onShareDocs(collectionId, "", folder.id, folder.name)}
            size="small"
            sx={{ textTransform: "none", borderRadius: 2 }}
          >
            {t("share.title")}
          </Button>
        )}
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} /> : <Save />}
          onClick={handleSave}
          disabled={saving || !isDirty || !name.trim()}
          size="small"
          sx={{ textTransform: "none", borderRadius: 2 }}
        >
          {t("common.save")}
        </Button>
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
        <Tab label={t("folder.overview")} />
        <Tab label={t("folder.variables")} />
        <Tab label={t("collectionDetail.authorization")} />
        <Tab label={t("folder.preRequest")} />
        <Tab label={t("folder.tests")} />
      </Tabs>

      {/* Overview Tab */}
      {activeTab === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          <Paper variant="outlined" sx={sectionPaper}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Description sx={{ fontSize: 18 }} />
                {t("folder.description")}
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
                placeholder={t("folder.noDescription")}
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
                  "&:hover": { borderColor: alpha(theme.palette.primary.main, 0.3) },
                  "& h1": { fontSize: "1.5rem", fontWeight: 700, mt: 0, mb: 1 },
                  "& h2": { fontSize: "1.25rem", fontWeight: 600, mt: 2, mb: 1 },
                  "& h3": { fontSize: "1.1rem", fontWeight: 600, mt: 1.5, mb: 0.75 },
                  "& p": { fontSize: "0.875rem", lineHeight: 1.7, my: 0.75, color: "text.primary" },
                  "& ul, & ol": { fontSize: "0.875rem", pl: 2.5, my: 0.75 },
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
                  "& a": { color: "primary.main" },
                }}
              >
                {description.trim() ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
                ) : (
                  <Typography variant="body2" color="text.disabled" fontStyle="italic">
                    {t("folder.noDescription")}
                  </Typography>
                )}
              </Box>
            )}
          </Paper>
        </Box>
      )}

      {/* Variables Tab */}
      {activeTab === 1 && (
        <Paper variant="outlined" sx={sectionPaper}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
            {t("folder.variables")}
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>{t("common.key")}</TableCell>
                  <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>{t("common.value")}</TableCell>
                  <TableCell width={40} />
                </TableRow>
              </TableHead>
              <TableBody>
                {vars.map((v, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <TextField
                        value={v.key}
                        onChange={(e) => updateVar(i, "key", e.target.value)}
                        size="small"
                        fullWidth
                        variant="standard"
                        placeholder={t("common.key")}
                        slotProps={{ input: { sx: { fontSize: "0.8rem" } } }}
                      />
                    </TableCell>
                    <TableCell>
                      <VariableValueCell
                        value={v.value}
                        onChange={(val) => updateVar(i, "value", val)}
                        placeholder={t("common.value")}
                        resolvedVariables={resolvedVariables}
                        variableGroups={variableGroups}
                      />
                    </TableCell>
                    <TableCell>
                      {v.key.trim() && (
                        <IconButton size="small" onClick={() => removeVar(i)}>
                          <DeleteOutline sx={{ fontSize: 16 }} />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Button
            size="small"
            startIcon={<Add />}
            onClick={() => setVars((prev) => [...prev, { key: "", value: "" }])}
            sx={{ mt: 1, textTransform: "none" }}
          >
            {t("common.add")}
          </Button>
        </Paper>
      )}

      {/* Authorization Tab */}
      {activeTab === 2 && (
        <Paper variant="outlined" sx={sectionPaper}>
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
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              {t("folder.preRequest")}
            </Typography>
            <ToggleButtonGroup
              value={scriptLanguage}
              exclusive
              onChange={(_, v) => v && setScriptLanguage(v)}
              size="small"
              sx={{ "& .MuiToggleButton-root": { px: 1.5, py: 0.25, fontSize: "0.75rem", textTransform: "none" } }}
            >
              <ToggleButton value="javascript">JavaScript</ToggleButton>
              <ToggleButton value="python">Python</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box sx={{ border: `1px solid ${alpha(theme.palette.divider, 0.15)}`, borderRadius: 1, overflow: "hidden" }}>
            <Editor
              height="300px"
              language={scriptLanguage === "python" ? "python" : "javascript"}
              value={preRequestScript}
              onChange={(v) => setPreRequestScript(v || "")}
              theme={isDark ? "vs-dark" : "light"}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                lineNumbers: "on",
                wordWrap: "on",
                tabSize: 2,
              }}
            />
          </Box>
        </Paper>
      )}

      {/* Tests (Post-response) Tab */}
      {activeTab === 4 && (
        <Paper variant="outlined" sx={sectionPaper}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              {t("folder.tests")}
            </Typography>
            <ToggleButtonGroup
              value={scriptLanguage}
              exclusive
              onChange={(_, v) => v && setScriptLanguage(v)}
              size="small"
              sx={{ "& .MuiToggleButton-root": { px: 1.5, py: 0.25, fontSize: "0.75rem", textTransform: "none" } }}
            >
              <ToggleButton value="javascript">JavaScript</ToggleButton>
              <ToggleButton value="python">Python</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box sx={{ border: `1px solid ${alpha(theme.palette.divider, 0.15)}`, borderRadius: 1, overflow: "hidden" }}>
            <Editor
              height="300px"
              language={scriptLanguage === "python" ? "python" : "javascript"}
              value={postResponseScript}
              onChange={(v) => setPostResponseScript(v || "")}
              theme={isDark ? "vs-dark" : "light"}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                lineNumbers: "on",
                wordWrap: "on",
                tabSize: 2,
              }}
            />
          </Box>
        </Paper>
      )}
    </Box>
  );
}
