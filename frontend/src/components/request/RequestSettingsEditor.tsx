import {
  Box,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
  Select,
  MenuItem,
  Chip,
  Divider,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import type { RequestSettings } from "@/types";

interface RequestSettingsEditorProps {
  settings: RequestSettings;
  onChange: (settings: RequestSettings) => void;
}

const TLS_PROTOCOLS = ["TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"];

export default function RequestSettingsEditor({
  settings,
  onChange,
}: RequestSettingsEditorProps) {
  const { t } = useTranslation();

  const update = (patch: Partial<RequestSettings>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: 1 }}>
      {/* HTTP Version */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600, fontSize: "0.82rem" }}>
          {t("requestSettings.httpVersion")}
        </Typography>
        <Select
          size="small"
          value={settings.httpVersion}
          onChange={(e) => update({ httpVersion: e.target.value as "http1" | "http2" })}
          sx={{ minWidth: 160, fontSize: "0.82rem" }}
        >
          <MenuItem value="http1">{t("requestSettings.http1")}</MenuItem>
          <MenuItem value="http2">{t("requestSettings.http2")}</MenuItem>
        </Select>
      </Box>

      <Divider />

      {/* SSL Verification */}
      <Box>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={settings.verifySsl}
              onChange={(e) => update({ verifySsl: e.target.checked })}
            />
          }
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                {t("requestSettings.verifySsl")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("requestSettings.verifySslDesc")}
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", ml: 0 }}
        />
      </Box>

      {/* Follow Redirects */}
      <Box>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={settings.followRedirects}
              onChange={(e) => update({ followRedirects: e.target.checked })}
            />
          }
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                {t("requestSettings.followRedirects")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("requestSettings.followRedirectsDesc")}
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", ml: 0 }}
        />
      </Box>

      {/* Follow Original Method */}
      <Box>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={settings.followOriginalMethod}
              onChange={(e) => update({ followOriginalMethod: e.target.checked })}
            />
          }
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                {t("requestSettings.followOriginalMethod")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("requestSettings.followOriginalMethodDesc")}
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", ml: 0 }}
        />
      </Box>

      {/* Follow Authorization Header */}
      <Box>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={settings.followAuthHeader}
              onChange={(e) => update({ followAuthHeader: e.target.checked })}
            />
          }
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                {t("requestSettings.followAuthHeader")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("requestSettings.followAuthHeaderDesc")}
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", ml: 0 }}
        />
      </Box>

      {/* Remove Referer on Redirect */}
      <Box>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={settings.removeRefererOnRedirect}
              onChange={(e) => update({ removeRefererOnRedirect: e.target.checked })}
            />
          }
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                {t("requestSettings.removeReferer")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("requestSettings.removeRefererDesc")}
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", ml: 0 }}
        />
      </Box>

      {/* Encode URL Automatically */}
      <Box>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={settings.encodeUrl}
              onChange={(e) => update({ encodeUrl: e.target.checked })}
            />
          }
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                {t("requestSettings.encodeUrl")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("requestSettings.encodeUrlDesc")}
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", ml: 0 }}
        />
      </Box>

      {/* Disable Cookie Jar */}
      <Box>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={settings.disableCookieJar}
              onChange={(e) => update({ disableCookieJar: e.target.checked })}
            />
          }
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                {t("requestSettings.disableCookieJar")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("requestSettings.disableCookieJarDesc")}
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", ml: 0 }}
        />
      </Box>

      {/* Use Server Cipher Suite */}
      <Box>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={settings.useServerCipherSuite}
              onChange={(e) => update({ useServerCipherSuite: e.target.checked })}
            />
          }
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                {t("requestSettings.serverCipherSuite")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("requestSettings.serverCipherSuiteDesc")}
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", ml: 0 }}
        />
      </Box>

      <Divider />

      {/* Maximum number of redirects */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600, fontSize: "0.82rem" }}>
          {t("requestSettings.maxRedirects")}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
          {t("requestSettings.maxRedirectsDesc")}
        </Typography>
        <TextField
          size="small"
          type="number"
          value={settings.maxRedirects}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= 0 && val <= 100) {
              update({ maxRedirects: val });
            }
          }}
          inputProps={{ min: 0, max: 100 }}
          sx={{ width: 120 }}
        />
      </Box>

      <Divider />

      {/* Disabled TLS Protocols */}
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600, fontSize: "0.82rem" }}>
          {t("requestSettings.disabledTlsProtocols")}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
          {t("requestSettings.disabledTlsProtocolsDesc")}
        </Typography>
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {TLS_PROTOCOLS.map((proto) => {
            const isDisabled = settings.disabledTlsProtocols.includes(proto);
            return (
              <Chip
                key={proto}
                label={proto}
                size="small"
                clickable
                color={isDisabled ? "error" : "default"}
                variant={isDisabled ? "filled" : "outlined"}
                onClick={() => {
                  const next = isDisabled
                    ? settings.disabledTlsProtocols.filter((p) => p !== proto)
                    : [...settings.disabledTlsProtocols, proto];
                  update({ disabledTlsProtocols: next });
                }}
                sx={{ fontSize: "0.75rem" }}
              />
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
