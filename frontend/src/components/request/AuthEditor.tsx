import {
  Box,
  TextField,
  Select,
  MenuItem,
  Typography,
  FormControl,
  InputLabel,
  InputAdornment,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import OAuthEditor from "./OAuthEditor";
import type { AuthType, OAuthConfig } from "@/types";

interface AuthEditorProps {
  authType: AuthType;
  bearerToken: string;
  basicUsername: string;
  basicPassword: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyPlacement: "header" | "query";
  oauthConfig: OAuthConfig;
  onAuthTypeChange: (t: AuthType) => void;
  onBearerTokenChange: (v: string) => void;
  onBasicUsernameChange: (v: string) => void;
  onBasicPasswordChange: (v: string) => void;
  onApiKeyNameChange: (v: string) => void;
  onApiKeyValueChange: (v: string) => void;
  onApiKeyPlacementChange: (v: "header" | "query") => void;
  onOAuthConfigChange: (config: OAuthConfig) => void;
}

export default function AuthEditor(props: AuthEditorProps) {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [showToken, setShowToken] = useState(false);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: 1 }}>
      <FormControl size="small" sx={{ maxWidth: 220 }}>
        <InputLabel>{t("request.authType")}</InputLabel>
        <Select
          value={props.authType}
          onChange={(e) => props.onAuthTypeChange(e.target.value as AuthType)}
          label={t("request.authType")}
        >
          <MenuItem value="none">{t("request.none")}</MenuItem>
          <MenuItem value="bearer">{t("request.bearer")}</MenuItem>
          <MenuItem value="api_key">{t("request.apiKey")}</MenuItem>
          <MenuItem value="basic">{t("request.basic")}</MenuItem>
          <MenuItem value="oauth2">{t("request.oauth2")}</MenuItem>
        </Select>
      </FormControl>

      {props.authType === "bearer" && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography variant="subtitle2">{t("request.bearerTitle")}</Typography>
          <TextField
            fullWidth
            size="small"
            placeholder={t("request.enterToken")}
            value={props.bearerToken}
            onChange={(e) => props.onBearerTokenChange(e.target.value)}
            type={showToken ? "text" : "password"}
            InputProps={{
              sx: { fontFamily: "monospace", fontSize: 13 },
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowToken(!showToken)}>
                    {showToken ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      )}

      {props.authType === "basic" && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography variant="subtitle2">{t("request.basicTitle")}</Typography>
          <TextField
            fullWidth
            size="small"
            label={t("auth.username")}
            value={props.basicUsername}
            onChange={(e) => props.onBasicUsernameChange(e.target.value)}
            InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }}
          />
          <TextField
            fullWidth
            size="small"
            label={t("auth.password")}
            value={props.basicPassword}
            onChange={(e) => props.onBasicPasswordChange(e.target.value)}
            type={showPassword ? "text" : "password"}
            InputProps={{
              sx: { fontFamily: "monospace", fontSize: 13 },
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      )}

      {props.authType === "api_key" && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography variant="subtitle2">{t("request.apiKeyTitle")}</Typography>
          <TextField
            fullWidth
            size="small"
            label={t("request.keyName")}
            placeholder="X-API-Key"
            value={props.apiKeyName}
            onChange={(e) => props.onApiKeyNameChange(e.target.value)}
            InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }}
          />
          <TextField
            fullWidth
            size="small"
            label={t("request.keyValue")}
            value={props.apiKeyValue}
            onChange={(e) => props.onApiKeyValueChange(e.target.value)}
            type={showToken ? "text" : "password"}
            InputProps={{
              sx: { fontFamily: "monospace", fontSize: 13 },
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowToken(!showToken)}>
                    {showToken ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
              {t("request.addTo")}
            </Typography>
            <ToggleButtonGroup
              value={props.apiKeyPlacement}
              exclusive
              onChange={(_, v) => v && props.onApiKeyPlacementChange(v)}
              size="small"
            >
              <ToggleButton value="header">{t("request.header")}</ToggleButton>
              <ToggleButton value="query">{t("request.queryParam")}</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      )}

      {props.authType === "oauth2" && (
        <OAuthEditor
          config={props.oauthConfig}
          onChange={props.onOAuthConfigChange}
        />
      )}

      {props.authType === "none" && (
        <Typography variant="body2" color="text.secondary">
          {t("request.noAuth")}
        </Typography>
      )}
    </Box>
  );
}
