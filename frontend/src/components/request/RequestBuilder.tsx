import { useState, useMemo, useRef, useEffect } from "react";
import {
  Box,
  Select,
  MenuItem,
  Button,
  Tabs,
  Tab,
  Badge,
  CircularProgress,
  FormControl,
  Chip,
  Typography,
  InputAdornment,
  IconButton,
  Tooltip,
  Portal,
} from "@mui/material";
import { Send, Save, Dns, NetworkPing } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import KeyValueEditor from "@/components/common/KeyValueEditor";
import VariableInsertButton from "@/components/common/VariableInsertButton";
import { useVariableGroups } from "@/hooks/useVariableGroups";
import UrlInput from "./UrlInput";
import AuthEditor from "./AuthEditor";
import BodyEditor from "./BodyEditor";
import RequestSettingsEditor from "./RequestSettingsEditor";
import { DnsResolveModal, PingModal } from "./NetworkToolsModals";
import type { HttpMethod, AuthType, BodyType, KeyValuePair, Environment, OAuthConfig, RequestSettings } from "@/types";
import { defaultRequestSettings } from "@/types";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const METHOD_COLORS: Record<string, string> = {
  GET: "#34d399",
  POST: "#fbbf24",
  PUT: "#818cf8",
  PATCH: "#f472b6",
  DELETE: "#f87171",
  HEAD: "#38bdf8",
  OPTIONS: "#a78bfa",
};

const ENV_COLORS: Record<string, string> = {
  LIVE: "#ef4444",
  TEST: "#f59e0b",
  DEV: "#10b981",
};

interface RequestBuilderProps {
  method: HttpMethod;
  url: string;
  pathParams: Record<string, string>;
  headers: KeyValuePair[];
  queryParams: KeyValuePair[];
  body: string;
  bodyType: BodyType;
  formData: KeyValuePair[];
  authType: AuthType;
  bearerToken: string;
  basicUsername: string;
  basicPassword: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyPlacement: "header" | "query";
  oauthConfig: OAuthConfig;
  loading: boolean;
  environments: Environment[];
  selectedEnvId: string | null;
  envOverrideId: string | null;
  onMethodChange: (m: HttpMethod) => void;
  onUrlChange: (u: string) => void;
  onPathParamsChange: (params: Record<string, string>) => void;
  onHeadersChange: (h: KeyValuePair[]) => void;
  onQueryParamsChange: (p: KeyValuePair[]) => void;
  onBodyChange: (b: string) => void;
  onBodyTypeChange: (t: BodyType) => void;
  onFormDataChange: (pairs: KeyValuePair[]) => void;
  onAuthTypeChange: (a: AuthType) => void;
  onBearerTokenChange: (v: string) => void;
  onBasicUsernameChange: (v: string) => void;
  onBasicPasswordChange: (v: string) => void;
  onApiKeyNameChange: (v: string) => void;
  onApiKeyValueChange: (v: string) => void;
  onApiKeyPlacementChange: (v: "header" | "query") => void;
  onOAuthConfigChange: (config: OAuthConfig) => void;
  collectionVariables: Record<string, string>;
  workspaceGlobals?: Record<string, string>;
  onEnvOverrideChange: (id: string | null) => void;
  requestSettings: RequestSettings;
  onRequestSettingsChange: (settings: RequestSettings) => void;
  onSend: () => void;
  onSave: () => void;
}

export default function RequestBuilder(props: RequestBuilderProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [tab, setTab] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sendButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showFloatingSend, setShowFloatingSend] = useState(false);

  const activeParamsCount = props.queryParams.filter((p) => p.enabled && p.key).length;
  const activeHeadersCount = props.headers.filter((h) => h.enabled && h.key).length;

  const activeEnvId = props.envOverrideId ?? props.selectedEnvId;
  const activeEnv = props.environments.find((e) => e.id === activeEnvId);
  const envVariables = activeEnv?.variables ?? [];

  const { groups: variableGroups, resolved: resolvedVariables } = useVariableGroups(
    envVariables,
    props.collectionVariables,
    props.workspaceGlobals,
  );

  const [dnsOpen, setDnsOpen] = useState(false);
  const [pingOpen, setPingOpen] = useState(false);

  const hostname = useMemo(() => {
    let resolved = props.url;
    if (resolvedVariables) {
      for (const [key, info] of resolvedVariables) {
        resolved = resolved.split(`{{${key}}}`).join(info.value);
      }
    }
    for (const [key, value] of Object.entries(props.pathParams)) {
      if (value) {
        resolved = resolved.split(`{${key}}`).join(value);
      }
    }
    try {
      return new URL(resolved).hostname;
    } catch {
      const match = resolved.match(/(?:https?:\/\/)?([^/:]+)/);
      return match?.[1] ?? "";
    }
  }, [props.url, resolvedVariables, props.pathParams]);

  const handleInsertVariable = (varKey: string) => {
    props.onUrlChange(props.url + `{{${varKey}}}`);
  };

  const methodColor = METHOD_COLORS[props.method] ?? "#888";

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
    <Box ref={containerRef} sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5, height: "100%", overflow: "auto" }}>
      {/* URL Bar */}
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <Select
          value={props.method}
          onChange={(e) => props.onMethodChange(e.target.value as HttpMethod)}
          size="small"
          sx={{
            minWidth: 110,
            fontWeight: 700,
            fontSize: "0.82rem",
            color: methodColor,
            borderRadius: 2,
            "& .MuiSelect-select": { py: 0.85 },
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: alpha(methodColor, 0.3),
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: alpha(methodColor, 0.5),
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: methodColor,
              borderWidth: 1.5,
            },
          }}
        >
          {METHODS.map((m) => (
            <MenuItem key={m} value={m} sx={{ fontWeight: 700, color: METHOD_COLORS[m] }}>
              {m}
            </MenuItem>
          ))}
        </Select>

        <Box sx={{ flex: "1 1 320px", minWidth: 220 }}>
          <UrlInput
            url={props.url}
            pathParams={props.pathParams}
            onUrlChange={props.onUrlChange}
            onPathParamsChange={props.onPathParamsChange}
            onSend={props.onSend}
            placeholder={t("request.url")}
            variableGroups={variableGroups}
            resolvedVariables={resolvedVariables}
            endAdornment={
              envVariables.length > 0 ? (
                <InputAdornment position="end">
                  <VariableInsertButton
                    variables={envVariables}
                    onInsert={handleInsertVariable}
                  />
                </InputAdornment>
              ) : undefined
            }
          />
        </Box>

        {/* DNS Resolve & Ping buttons */}
        <Tooltip title={hostname ? t("network.dnsResolve") : t("network.noHostname")}>
          <span>
            <IconButton
              size="small"
              onClick={() => setDnsOpen(true)}
              disabled={!hostname}
              sx={{ width: 32, height: 32 }}
            >
              <Dns fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={hostname ? t("network.ping") : t("network.noHostname")}>
          <span>
            <IconButton
              size="small"
              onClick={() => setPingOpen(true)}
              disabled={!hostname}
              sx={{ width: 32, height: 32 }}
            >
              <NetworkPing fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        {/* Per-request env */}
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <Select
            value={props.envOverrideId ?? "__global__"}
            onChange={(e) => {
              const val = e.target.value;
              props.onEnvOverrideChange(val === "__global__" ? null : val);
            }}
            sx={{
              height: 36,
              fontSize: "0.75rem",
              borderRadius: 2,
            }}
            renderValue={(value) => {
              if (value === "__global__") {
                const globalEnv = props.environments.find((e) => e.id === props.selectedEnvId);
                return (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {globalEnv && (
                      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: ENV_COLORS[globalEnv.env_type] ?? "#888" }} />
                    )}
                    <Typography variant="caption" sx={{ fontSize: "0.72rem" }}>
                      {globalEnv ? globalEnv.name : t("environment.select")}
                    </Typography>
                  </Box>
                );
              }
              const env = props.environments.find((e) => e.id === value);
              return env ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: ENV_COLORS[env.env_type] ?? "#888" }} />
                  <Typography variant="caption" fontWeight={600} sx={{ fontSize: "0.72rem" }}>
                    {env.name}
                  </Typography>
                </Box>
              ) : null;
            }}
          >
            <MenuItem value="__global__">
              <em>{t("environment.useGlobal")}</em>
            </MenuItem>
            {props.environments.map((env) => (
              <MenuItem key={env.id} value={env.id}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Chip
                    label={env.env_type}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: 10,
                      fontWeight: 700,
                      bgcolor: ENV_COLORS[env.env_type] ?? "#888",
                      color: "#fff",
                    }}
                  />
                  <span>{env.name}</span>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            ref={sendButtonRef}
            variant="contained"
            onClick={props.onSend}
            disabled={props.loading || !props.url}
            startIcon={props.loading ? <CircularProgress size={14} /> : <Send sx={{ fontSize: 16 }} />}
            sx={{
              minWidth: 100,
              whiteSpace: "nowrap",
              height: 36,
              borderRadius: 2,
              fontWeight: 600,
              fontSize: "0.82rem",
              background: `linear-gradient(135deg, ${methodColor} 0%, ${alpha(methodColor, 0.7)} 100%)`,
              color: isDark ? "#0b0e14" : "#fff",
              "&:hover": {
                background: `linear-gradient(135deg, ${methodColor} 0%, ${alpha(methodColor, 0.85)} 100%)`,
                boxShadow: `0 4px 16px ${alpha(methodColor, 0.35)}`,
              },
              "&:disabled": {
                background: alpha(theme.palette.text.primary, 0.08),
                color: alpha(theme.palette.text.primary, 0.3),
              },
            }}
          >
            {t("request.send")}
          </Button>

          <Button
            variant="outlined"
            onClick={props.onSave}
            startIcon={<Save sx={{ fontSize: 16 }} />}
            sx={{
              minWidth: 80,
              whiteSpace: "nowrap",
              height: 36,
              borderRadius: 2,
              fontWeight: 500,
              fontSize: "0.82rem",
            }}
          >
            {t("common.save")}
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab
          label={
            <Badge
              badgeContent={activeParamsCount}
              color="primary"
              sx={{ "& .MuiBadge-badge": { fontSize: 10, minWidth: 16, height: 16 } }}
            >
              {t("request.params")}
            </Badge>
          }
        />
        <Tab
          label={
            <Badge
              badgeContent={activeHeadersCount}
              color="primary"
              sx={{ "& .MuiBadge-badge": { fontSize: 10, minWidth: 16, height: 16 } }}
            >
              {t("request.headers")}
            </Badge>
          }
        />
        <Tab label={t("request.body")} />
        <Tab label={t("request.auth")} />
        <Tab label={t("request.settings", "Settings")} />
      </Tabs>

      <Box sx={{ minHeight: 180, animation: "fadeIn 0.2s ease" }}>
        {tab === 0 && (
          <KeyValueEditor
            pairs={props.queryParams}
            onChange={props.onQueryParamsChange}
            keyLabel={t("request.parameter")}
            valueLabel={t("common.value")}
            showDescription
            resolvedVariables={resolvedVariables}
            variableGroups={variableGroups}
          />
        )}

        {tab === 1 && (
          <KeyValueEditor
            pairs={props.headers}
            onChange={props.onHeadersChange}
            keyLabel={t("request.header")}
            valueLabel={t("common.value")}
            resolvedVariables={resolvedVariables}
            variableGroups={variableGroups}
          />
        )}

        {tab === 2 && (
          <BodyEditor
            bodyType={props.bodyType}
            body={props.body}
            formData={props.formData}
            onBodyTypeChange={props.onBodyTypeChange}
            onBodyChange={props.onBodyChange}
            onFormDataChange={props.onFormDataChange}
            variableGroups={variableGroups}
            resolvedVariables={resolvedVariables}
          />
        )}

        {tab === 3 && (
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

        {tab === 4 && (
          <RequestSettingsEditor
            settings={props.requestSettings ?? defaultRequestSettings}
            onChange={props.onRequestSettingsChange}
          />
        )}
      </Box>

      {/* Network tools modals */}
      <DnsResolveModal open={dnsOpen} onClose={() => setDnsOpen(false)} hostname={hostname} />
      <PingModal open={pingOpen} onClose={() => setPingOpen(false)} hostname={hostname} />

      {showFloatingSend && (
        <Portal>
          <Button
            variant="contained"
            onClick={props.onSend}
            disabled={props.loading || !props.url}
            startIcon={props.loading ? <CircularProgress size={14} /> : <Send sx={{ fontSize: 16 }} />}
            sx={{
              position: "fixed",
              right: 24,
              bottom: 24,
              zIndex: theme.zIndex.modal + 1,
              borderRadius: 999,
              px: 2.25,
              py: 1,
              fontWeight: 700,
              fontSize: "0.9rem",
              background: `linear-gradient(135deg, ${methodColor} 0%, ${alpha(methodColor, 0.7)} 100%)`,
              color: isDark ? "#0b0e14" : "#fff",
              boxShadow: `0 12px 30px ${alpha(methodColor, 0.35)}`,
              "&:hover": {
                background: `linear-gradient(135deg, ${methodColor} 0%, ${alpha(methodColor, 0.85)} 100%)`,
                boxShadow: `0 14px 36px ${alpha(methodColor, 0.45)}`,
              },
              "&:disabled": {
                background: alpha(theme.palette.text.primary, 0.08),
                color: alpha(theme.palette.text.primary, 0.3),
                boxShadow: "none",
              },
            }}
          >
            {t("request.send")}
          </Button>
        </Portal>
      )}
    </Box>
  );
}
