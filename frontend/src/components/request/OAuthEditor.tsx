import { useState } from "react";
import {
  Box,
  TextField,
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
  InputAdornment,
  IconButton,
} from "@mui/material";
import { Visibility, VisibilityOff, Key, OpenInNew } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { oauthApi } from "@/api/endpoints";
import type { OAuthConfig } from "@/types";

interface OAuthEditorProps {
  config: OAuthConfig;
  onChange: (config: OAuthConfig) => void;
}

export default function OAuthEditor({ config, onChange }: OAuthEditorProps) {
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
        // Open auth URL in new window
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
          <TextField
            fullWidth
            size="small"
            label={t("oauth.authUrl")}
            placeholder="https://provider.com/oauth/authorize"
            value={config.authUrl}
            onChange={(e) => update({ authUrl: e.target.value })}
            InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }}
          />

          <TextField
            fullWidth
            size="small"
            label={t("oauth.redirectUri")}
            placeholder="http://localhost:5173/oauth/callback"
            value={config.redirectUri}
            onChange={(e) => update({ redirectUri: e.target.value })}
            InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }}
          />

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

      <TextField
        fullWidth
        size="small"
        label={t("oauth.tokenUrl")}
        placeholder="https://provider.com/oauth/token"
        value={config.tokenUrl}
        onChange={(e) => update({ tokenUrl: e.target.value })}
        InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }}
      />

      <TextField
        fullWidth
        size="small"
        label={t("oauth.clientId")}
        value={config.clientId}
        onChange={(e) => update({ clientId: e.target.value })}
        InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }}
      />

      <TextField
        fullWidth
        size="small"
        label={t("oauth.clientSecret")}
        value={config.clientSecret}
        onChange={(e) => update({ clientSecret: e.target.value })}
        type={showSecret ? "text" : "password"}
        InputProps={{
          sx: { fontFamily: "monospace", fontSize: 13 },
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                size="small"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? (
                  <VisibilityOff fontSize="small" />
                ) : (
                  <Visibility fontSize="small" />
                )}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />

      <TextField
        fullWidth
        size="small"
        label={t("oauth.scope")}
        placeholder="read write"
        value={config.scope}
        onChange={(e) => update({ scope: e.target.value })}
        InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }}
      />

      {error && (
        <Alert severity="error" sx={{ fontSize: 12 }}>
          {error}
        </Alert>
      )}

      {config.grantType === "authorization_code" && (
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
          <TextField
            fullWidth
            size="small"
            label={t("oauth.authorizationCodeInput")}
            placeholder={t("oauth.pasteCode")}
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }}
          />
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
          <TextField
            fullWidth
            size="small"
            value={config.accessToken}
            onChange={(e) => update({ accessToken: e.target.value })}
            type={showToken ? "text" : "password"}
            InputProps={{
              sx: { fontFamily: "monospace", fontSize: 12 },
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? (
                      <VisibilityOff fontSize="small" />
                    ) : (
                      <Visibility fontSize="small" />
                    )}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      )}
    </Box>
  );
}
