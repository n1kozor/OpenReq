import {
  Box,
  Select,
  MenuItem,
  Typography,
  FormControl,
  InputLabel,
  IconButton,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { VariableValueCell } from "@/components/common/KeyValueEditor";
import OAuthEditor from "./OAuthEditor";
import type { AuthType, OAuthConfig } from "@/types";
import type { VariableInfo, VariableGroup } from "@/hooks/useVariableGroups";

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
  resolvedVariables?: Map<string, VariableInfo>;
  variableGroups?: VariableGroup[];
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
          <MenuItem value="inherit">{t("request.inherit")}</MenuItem>
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ flex: 1 }}>
              <VariableValueCell
                value={showToken ? props.bearerToken : props.bearerToken}
                onChange={props.onBearerTokenChange}
                placeholder={t("request.enterToken")}
                resolvedVariables={props.resolvedVariables}
                variableGroups={props.variableGroups}
                masked={!showToken}
              />
            </Box>
            <IconButton size="small" onClick={() => setShowToken(!showToken)}>
              {showToken ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
            </IconButton>
          </Box>
        </Box>
      )}

      {props.authType === "basic" && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography variant="subtitle2">{t("request.basicTitle")}</Typography>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
              {t("auth.username")}
            </Typography>
            <VariableValueCell
              value={props.basicUsername}
              onChange={props.onBasicUsernameChange}
              placeholder={t("auth.username")}
              resolvedVariables={props.resolvedVariables}
              variableGroups={props.variableGroups}
            />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
              {t("auth.password")}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ flex: 1 }}>
                <VariableValueCell
                  value={props.basicPassword}
                  onChange={props.onBasicPasswordChange}
                  placeholder={t("auth.password")}
                  resolvedVariables={props.resolvedVariables}
                variableGroups={props.variableGroups}
                  masked={!showPassword}
                />
              </Box>
              <IconButton size="small" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
              </IconButton>
            </Box>
          </Box>
        </Box>
      )}

      {props.authType === "api_key" && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography variant="subtitle2">{t("request.apiKeyTitle")}</Typography>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
              {t("request.keyName")}
            </Typography>
            <VariableValueCell
              value={props.apiKeyName}
              onChange={props.onApiKeyNameChange}
              placeholder="X-API-Key"
              resolvedVariables={props.resolvedVariables}
              variableGroups={props.variableGroups}
            />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
              {t("request.keyValue")}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ flex: 1 }}>
                <VariableValueCell
                  value={props.apiKeyValue}
                  onChange={props.onApiKeyValueChange}
                  placeholder={t("request.keyValue")}
                  resolvedVariables={props.resolvedVariables}
                variableGroups={props.variableGroups}
                  masked={!showToken}
                />
              </Box>
              <IconButton size="small" onClick={() => setShowToken(!showToken)}>
                {showToken ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
              </IconButton>
            </Box>
          </Box>
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
          resolvedVariables={props.resolvedVariables}
          variableGroups={props.variableGroups}
        />
      )}

      {props.authType === "inherit" && (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
          {t("request.inheritDescription")}
        </Typography>
      )}

      {props.authType === "none" && (
        <Typography variant="body2" color="text.secondary">
          {t("request.noAuth")}
        </Typography>
      )}
    </Box>
  );
}
