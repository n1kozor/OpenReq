import { useState } from "react";
import {
  Box,
  Select,
  MenuItem,
  Typography,
  FormControl,
  InputLabel,
  Button,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
} from "@mui/material";
import { Visibility, VisibilityOff, Key, OpenInNew } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { oauthApi } from "@/api/endpoints";
import { VariableValueCell } from "@/components/common/KeyValueEditor";
import type { OAuthConfig } from "@/types";
import type { VariableInfo, VariableGroup } from "@/hooks/useVariableGroups";

interface OAuthEditorProps {
  config: OAuthConfig;
  onChange: (config: OAuthConfig) => void;
  resolvedVariables?: Map<string, VariableInfo>;
  variableGroups?: VariableGroup[];
}

export default function OAuthEditor({ config, onChange, resolvedVariables, variableGroups }: OAuthEditorProps) {
  const { t } = useTranslation();
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pkce, setPkce] = useState<{
    code_verifier: string;
    code_challenge: string;
  } | null>(null);

  const update = (patch: Partial<OAuthConfig>) => {
    onChange({ ...config, ...patch });
  };

  const handleGetToken = async () => {
    setLoading(true);
    setError(null);

    try {
      if (config.grantType === "client_credentials") {
        const { data } = await oauthApi.exchangeToken({
          grant_type: "client_credentials",
          token_url: config.tokenUrl,
          client_id: config.clientId,
          client_secret: config.clientSecret || undefined,
          scope: config.scope || undefined,
        });

        if (data.success) {
          update({ accessToken: data.access_token });
        } else {
          setError(data.error || t("oauth.tokenFailed"));
        }
      } else if (config.grantType === "authorization_code") {
        const params = new URLSearchParams({
          response_type: "code",
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          scope: config.scope,
        });

        if (config.usePkce && pkce) {
          params.set("code_challenge", pkce.code_challenge);
          params.set("code_challenge_method", "S256");
        }

        const authUrl = `${config.authUrl}?${params.toString()}`;
        window.open(authUrl, "_blank", "width=600,height=700");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("oauth.tokenFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleExchangeCode = async (code: string) => {
    setLoading(true);
    setError(null);

    try {
      const { data } = await oauthApi.exchangeToken({
        grant_type: "authorization_code",
        token_url: config.tokenUrl,
        client_id: config.clientId,
        client_secret: config.clientSecret || undefined,
        code,
        redirect_uri: config.redirectUri,
        code_verifier: config.usePkce && pkce ? pkce.code_verifier : undefined,
      });

      if (data.success) {
        update({ accessToken: data.access_token });
      } else {
        setError(data.error || t("oauth.tokenFailed"));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("oauth.tokenFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePkce = async () => {
    try {
      const { data } = await oauthApi.generatePkce();
      setPkce(data);
    } catch {
      setError(t("oauth.pkceFailed"));
    }
  };

  const [authCode, setAuthCode] = useState("");

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: 1 }}>
      <Typography variant="subtitle2">OAuth 2.0</Typography>

      <FormControl size="small" sx={{ maxWidth: 280 }}>
        <InputLabel>{t("oauth.grantType")}</InputLabel>
        <Select
          value={config.grantType}
          onChange={(e) =>
            update({
              grantType: e.target.value as OAuthConfig["grantType"],
            })
          }
          label={t("oauth.grantType")}
        >
          <MenuItem value="authorization_code">
            {t("oauth.authorizationCode")}
          </MenuItem>
          <MenuItem value="client_credentials">
            {t("oauth.clientCredentials")}
          </MenuItem>
        </Select>
      </FormControl>

      {config.grantType === "authorization_code" && (
        <>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
              {t("oauth.authUrl")}
            </Typography>
            <VariableValueCell
              value={config.authUrl}
              onChange={(v) => update({ authUrl: v })}
              placeholder="https://provider.com/oauth/authorize"
              resolvedVariables={resolvedVariables}
              variableGroups={variableGroups}
            />
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
              {t("oauth.redirectUri")}
            </Typography>
            <VariableValueCell
              value={config.redirectUri}
              onChange={(v) => update({ redirectUri: v })}
              placeholder="http://localhost:5173/oauth/callback"
              resolvedVariables={resolvedVariables}
              variableGroups={variableGroups}
            />
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={config.usePkce}
                onChange={(e) => {
                  update({ usePkce: e.target.checked });
                  if (e.target.checked) handleGeneratePkce();
                }}
                size="small"
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                PKCE
                <Chip label="S256" size="small" sx={{ height: 18, fontSize: 10 }} />
              </Box>
            }
          />
        </>
      )}

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
          {t("oauth.tokenUrl")}
        </Typography>
        <VariableValueCell
          value={config.tokenUrl}
          onChange={(v) => update({ tokenUrl: v })}
          placeholder="https://provider.com/oauth/token"
          resolvedVariables={resolvedVariables}
        />
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
          {t("oauth.clientId")}
        </Typography>
        <VariableValueCell
          value={config.clientId}
          onChange={(v) => update({ clientId: v })}
          placeholder={t("oauth.clientId")}
          resolvedVariables={resolvedVariables}
        />
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
          {t("oauth.clientSecret")}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <VariableValueCell
              value={config.clientSecret}
              onChange={(v) => update({ clientSecret: v })}
              placeholder={t("oauth.clientSecret")}
              resolvedVariables={resolvedVariables}
              variableGroups={variableGroups}
              masked={!showSecret}
            />
          </Box>
          <IconButton size="small" onClick={() => setShowSecret(!showSecret)}>
            {showSecret ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
          </IconButton>
        </Box>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
          {t("oauth.scope")}
        </Typography>
        <VariableValueCell
          value={config.scope}
          onChange={(v) => update({ scope: v })}
          placeholder="read write"
          resolvedVariables={resolvedVariables}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ fontSize: 12 }}>
          {error}
        </Alert>
      )}

      {config.grantType === "authorization_code" && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
              {t("oauth.authorizationCodeInput")}
            </Typography>
            <VariableValueCell
              value={authCode}
              onChange={setAuthCode}
              placeholder={t("oauth.pasteCode")}
              resolvedVariables={resolvedVariables}
              variableGroups={variableGroups}
            />
          </Box>
          <Button
            variant="outlined"
            size="small"
            onClick={() => handleExchangeCode(authCode)}
            disabled={loading || !authCode}
            sx={{ minWidth: 100, whiteSpace: "nowrap" }}
          >
            {t("oauth.exchange")}
          </Button>
        </Box>
      )}

      <Box sx={{ display: "flex", gap: 1 }}>
        {config.grantType === "authorization_code" && (
          <Button
            variant="outlined"
            onClick={handleGetToken}
            disabled={loading || !config.authUrl || !config.clientId}
            startIcon={<OpenInNew />}
            size="small"
          >
            {t("oauth.authorize")}
          </Button>
        )}
        {config.grantType === "client_credentials" && (
          <Button
            variant="contained"
            onClick={handleGetToken}
            disabled={loading || !config.tokenUrl || !config.clientId}
            startIcon={
              loading ? <CircularProgress size={16} /> : <Key />
            }
            size="small"
          >
            {t("oauth.getToken")}
          </Button>
        )}
      </Box>

      {config.accessToken && (
        <Box>
          <Typography variant="caption" color="text.secondary">
            {t("oauth.currentToken")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ flex: 1 }}>
              <VariableValueCell
                value={config.accessToken}
                onChange={(v) => update({ accessToken: v })}
                placeholder={t("oauth.currentToken")}
                resolvedVariables={resolvedVariables}
              variableGroups={variableGroups}
                masked={!showToken}
              />
            </Box>
            <IconButton size="small" onClick={() => setShowToken(!showToken)}>
              {showToken ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
}
