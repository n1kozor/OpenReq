import { useState } from "react";
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  Tooltip,
  TextField,
  InputAdornment,
  ListSubheader,
} from "@mui/material";
import {
  Workspaces,
  Cloud,
  Lan,
  Search,
  FiberManualRecord,
  KeyboardArrowDown,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { useProxyMode } from "@/hooks/useProxyMode";
import type { Environment, Workspace, ProxyResponse } from "@/types";

declare const __APP_VERSION__: string;

interface StatusBarProps {
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  environments: Environment[];
  selectedEnvironmentId: string | null;
  onSelectEnvironment: (id: string | null) => void;
  activeResponse?: ProxyResponse | null;
  activeResponseTimestamp?: number | null;
}

const ENV_COLORS: Record<string, string> = {
  LIVE: "#cf5b56",
  TEST: "#e9b84a",
  DEV: "#59a869",
};

export default function StatusBar({
  workspaces,
  currentWorkspaceId,
  onSelectWorkspace,
  environments,
  selectedEnvironmentId,
  onSelectEnvironment,
  activeResponse,
  activeResponseTimestamp,
}: StatusBarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { proxyMode, setProxyMode, localAvailable } = useProxyMode();
  const [wsSearch, setWsSearch] = useState("");

  const currentWs = workspaces.find((w) => w.id === currentWorkspaceId);
  const currentEnv = environments.find((e) => e.id === selectedEnvironmentId);

  return (
    <Box
      sx={{
        height: 22,
        minHeight: 22,
        maxHeight: 22,
        display: "flex",
        alignItems: "center",
        px: 1,
        gap: 0,
        borderTop: `1px solid ${isDark ? "#393b40" : "#d1d1d1"}`,
        backgroundColor: isDark ? "#3c3f41" : "#f7f8fa",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Workspace selector */}
      <FormControl size="small" sx={{ minWidth: 0 }}>
        <Select
          value={currentWorkspaceId ?? ""}
          onChange={(e) => onSelectWorkspace(e.target.value)}
          onOpen={() => setWsSearch("")}
          IconComponent={KeyboardArrowDown}
          variant="standard"
          disableUnderline
          renderValue={() => (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Workspaces sx={{ fontSize: 12, color: theme.palette.primary.main }} />
              <Typography variant="caption" sx={{ fontSize: "0.68rem", fontWeight: 500 }}>
                {currentWs?.name ?? t("workspace.select")}
              </Typography>
            </Box>
          )}
          MenuProps={{ PaperProps: { sx: { maxHeight: 280 } }, autoFocus: false }}
          sx={{
            fontSize: "0.68rem",
            "& .MuiSelect-select": { py: "0px !important", px: "4px !important", display: "flex", alignItems: "center" },
            "& .MuiSelect-icon": { fontSize: 14 },
          }}
        >
          {workspaces.length >= 6 && (
            <ListSubheader sx={{ p: 0.5, lineHeight: "unset" }}>
              <TextField
                size="small"
                autoFocus
                placeholder={t("workspace.search")}
                fullWidth
                value={wsSearch}
                onChange={(e) => setWsSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 14 }} /></InputAdornment>,
                  sx: { fontSize: "0.75rem" },
                }}
              />
            </ListSubheader>
          )}
          {workspaces
            .filter((ws) => !wsSearch || ws.name.toLowerCase().includes(wsSearch.toLowerCase()))
            .map((ws) => (
              <MenuItem key={ws.id} value={ws.id} sx={{ fontSize: "0.78rem" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Workspaces sx={{ fontSize: 13, color: ws.id === currentWorkspaceId ? theme.palette.primary.main : theme.palette.text.secondary }} />
                  <span style={{ fontWeight: ws.id === currentWorkspaceId ? 600 : 400 }}>{ws.name}</span>
                </Box>
              </MenuItem>
            ))}
        </Select>
      </FormControl>

      <Divider />

      {/* Environment selector */}
      <FormControl size="small" sx={{ minWidth: 0 }}>
        <Select
          value={selectedEnvironmentId ?? "__none__"}
          onChange={(e) => onSelectEnvironment(e.target.value === "__none__" ? null : e.target.value)}
          variant="standard"
          disableUnderline
          IconComponent={KeyboardArrowDown}
          renderValue={() => {
            if (!currentEnv) return (
              <Typography variant="caption" sx={{ fontSize: "0.68rem", opacity: 0.6 }}>
                {t("environment.select")}
              </Typography>
            );
            const dotColor = ENV_COLORS[currentEnv.env_type] ?? "#888";
            return (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <FiberManualRecord sx={{ fontSize: 7, color: dotColor }} />
                <Typography variant="caption" sx={{ fontSize: "0.68rem", fontWeight: 500 }}>
                  {currentEnv.name}
                </Typography>
              </Box>
            );
          }}
          sx={{
            fontSize: "0.68rem",
            "& .MuiSelect-select": { py: "0px !important", px: "4px !important", display: "flex", alignItems: "center" },
            "& .MuiSelect-icon": { fontSize: 14 },
          }}
        >
          <MenuItem value="__none__" sx={{ fontSize: "0.78rem" }}>
            <em style={{ opacity: 0.6 }}>{t("environment.select")}</em>
          </MenuItem>
          {environments.map((env) => (
            <MenuItem key={env.id} value={env.id} sx={{ fontSize: "0.78rem" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <FiberManualRecord sx={{ fontSize: 7, color: ENV_COLORS[env.env_type] ?? "#888" }} />
                <span>{env.name}</span>
                <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "text.secondary", textTransform: "uppercase" }}>
                  {env.env_type}
                </Typography>
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Divider />

      {/* Proxy mode */}
      <Tooltip title={proxyMode === "local" ? t("proxyMode.localDesc") : t("proxyMode.serverDesc")}>
        <Box
          onClick={() => {
            if (proxyMode === "server" && localAvailable) setProxyMode("local");
            else setProxyMode("server");
          }}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            px: 0.75,
            cursor: "pointer",
            height: "100%",
            "&:hover": { backgroundColor: isDark ? "#4e5157" : "#e0e0e0" },
          }}
        >
          {proxyMode === "local" ? (
            <Lan sx={{ fontSize: 12, color: localAvailable ? theme.palette.success.main : theme.palette.error.main }} />
          ) : (
            <Cloud sx={{ fontSize: 12, color: theme.palette.text.secondary }} />
          )}
          <Typography variant="caption" sx={{ fontSize: "0.68rem", fontWeight: 400 }}>
            {t(`proxyMode.${proxyMode}`)}
          </Typography>
        </Box>
      </Tooltip>

      <Box sx={{ flexGrow: 1 }} />

      {/* Last response info */}
      {activeResponse && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 0.75 }}>
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.68rem",
              fontWeight: 600,
              color: activeResponse.status_code < 400 ? theme.palette.success.main : theme.palette.error.main,
            }}
          >
            {activeResponse.status_code}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: "0.68rem", color: theme.palette.text.secondary }}>
            {activeResponse.elapsed_ms.toFixed(0)}ms
          </Typography>
          {activeResponseTimestamp && (
            <Typography variant="caption" sx={{ fontSize: "0.68rem", color: theme.palette.text.secondary }}>
              {new Date(activeResponseTimestamp).toLocaleTimeString()}
            </Typography>
          )}
        </Box>
      )}

      <Divider />

      {/* Version */}
      <Typography
        variant="caption"
        sx={{ fontSize: "0.62rem", color: theme.palette.text.secondary, px: 0.75 }}
      >
        v{__APP_VERSION__}
      </Typography>
    </Box>
  );
}

function Divider() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  return (
    <Box
      sx={{
        width: 1,
        height: 14,
        backgroundColor: isDark ? "#4e5157" : "#c4c4c4",
        mx: 0.25,
        flexShrink: 0,
      }}
    />
  );
}
