import { useState } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Select,
  MenuItem,
  Box,
  Tooltip,
  FormControl,
  TextField,
  InputAdornment,
  ListSubheader,
} from "@mui/material";
import {
  DarkMode,
  LightMode,
  Logout,
  Workspaces,
  Cloud,
  Lan,
  Search,
  FiberManualRecord,
  KeyboardArrowDown,
  FolderOpen,
  History,
  AccountTree,
  SwapHoriz,
  FileDownload,
  SmartToy,
  Settings,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { useProxyMode } from "@/hooks/useProxyMode";
import type { Environment, Workspace } from "@/types";

interface TopBarProps {
  mode: "dark" | "light";
  onToggleTheme: () => void;
  onLogout: () => void;
  username?: string;
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  environments: Environment[];
  selectedEnvironmentId: string | null;
  onSelectEnvironment: (id: string | null) => void;
  // Nav actions
  showCollectionsSidebar: boolean;
  onToggleCollections: () => void;
  onOpenHistory: () => void;
  onOpenTestBuilder: () => void;
  onOpenImport: () => void;
  onOpenSDK: () => void;
  onOpenAIAgent: () => void;
  onOpenSettings: () => void;
  onOpenWorkspaceManager: () => void;
  onOpenEnvironmentManager: () => void;
  activeNavItem: "settings" | "aiAgent" | null;
}

const LANGUAGES = [
  { code: "en", label: "English", flag: "gb" },
  { code: "hu", label: "Magyar", flag: "hu" },
  { code: "de", label: "Deutsch", flag: "de" },
];

const ENV_COLORS: Record<string, string> = {
  LIVE: "#cf5b56",
  TEST: "#e9b84a",
  DEV: "#59a869",
};

export default function TopBar({
  mode,
  onToggleTheme,
  onLogout,
  username,
  workspaces,
  currentWorkspaceId,
  onSelectWorkspace,
  environments,
  selectedEnvironmentId,
  onSelectEnvironment,
  showCollectionsSidebar,
  onToggleCollections,
  onOpenHistory,
  onOpenTestBuilder,
  onOpenImport,
  onOpenSDK,
  onOpenAIAgent,
  onOpenSettings,
  onOpenWorkspaceManager,
  onOpenEnvironmentManager,
  activeNavItem,
}: TopBarProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isDark = mode === "dark";
  const { proxyMode, setProxyMode, localAvailable } = useProxyMode();
  const [wsSearch, setWsSearch] = useState("");

  const currentWs = workspaces.find((w) => w.id === currentWorkspaceId);
  const currentEnv = environments.find((e) => e.id === selectedEnvironmentId);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("openreq-lang", lang);
  };

  const navBtnSx = (active: boolean) => ({
    width: 28,
    height: 28,
    borderRadius: 1,
    color: active ? theme.palette.primary.main : theme.palette.text.secondary,
    backgroundColor: active ? (isDark ? "#2d4a6e" : "#cce0f5") : "transparent",
    "&:hover": {
      color: theme.palette.primary.main,
      backgroundColor: isDark ? "#4e5157" : "#e0e0e0",
    },
  });

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        zIndex: theme.zIndex.drawer + 1,
        borderBottom: `1px solid ${isDark ? "#4e5157" : "#d1d1d1"}`,
        backgroundColor: isDark ? "#3c3f41" : "#f7f8fa",
        color: theme.palette.text.primary,
      }}
    >
      <Toolbar
        sx={{
          gap: 0.25,
          minHeight: "40px !important",
          maxHeight: 40,
          px: "8px !important",
        }}
      >
        {/* Brand */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0, mr: 0.5 }}>
          <Box
            component="img"
            src="/logo.png"
            alt="OpenReq"
            sx={{ width: 22, height: 22 }}
          />
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: "0.85rem",
              color: theme.palette.text.primary,
            }}
          >
            OpenReq
          </Typography>
        </Box>

        <VerticalDivider />

        {/* Nav items */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          <Tooltip title={t("nav.collections")}>
            <IconButton size="small" onClick={onToggleCollections} sx={navBtnSx(showCollectionsSidebar)}>
              <FolderOpen sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("nav.workspace")}>
            <IconButton size="small" onClick={onOpenWorkspaceManager} sx={navBtnSx(false)}>
              <Workspaces sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("nav.environments")}>
            <IconButton size="small" onClick={onOpenEnvironmentManager} sx={navBtnSx(false)}>
              <Cloud sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("nav.history")}>
            <IconButton size="small" onClick={onOpenHistory} sx={navBtnSx(false)}>
              <History sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("nav.testBuilder")}>
            <IconButton size="small" onClick={onOpenTestBuilder} sx={navBtnSx(false)}>
              <AccountTree sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("importExport.title")}>
            <IconButton size="small" onClick={onOpenImport} sx={navBtnSx(false)}>
              <SwapHoriz sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("sdk.title")}>
            <IconButton size="small" onClick={onOpenSDK} sx={navBtnSx(false)}>
              <FileDownload sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("nav.aiAgent")}>
            <IconButton size="small" onClick={onOpenAIAgent} sx={navBtnSx(activeNavItem === "aiAgent")}>
              <SmartToy sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("nav.settings")}>
            <IconButton size="small" onClick={onOpenSettings} sx={navBtnSx(activeNavItem === "settings")}>
              <Settings sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>

        <VerticalDivider />

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
                <Workspaces sx={{ fontSize: 13, color: theme.palette.primary.main }} />
                <Typography variant="caption" sx={{ fontSize: "0.72rem", fontWeight: 500 }}>
                  {currentWs?.name ?? t("workspace.select")}
                </Typography>
              </Box>
            )}
            MenuProps={{ PaperProps: { sx: { maxHeight: 280 } }, autoFocus: false }}
            sx={{
              fontSize: "0.72rem",
              "& .MuiSelect-select": { py: "0px !important", pl: "4px !important", pr: "20px !important", display: "flex", alignItems: "center" },
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

        <VerticalDivider />

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
                <Typography variant="caption" sx={{ fontSize: "0.72rem", opacity: 0.6 }}>
                  {t("environment.select")}
                </Typography>
              );
              const dotColor = ENV_COLORS[currentEnv.env_type] ?? "#888";
              return (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <FiberManualRecord sx={{ fontSize: 7, color: dotColor }} />
                  <Typography variant="caption" sx={{ fontSize: "0.72rem", fontWeight: 500 }}>
                    {currentEnv.name}
                  </Typography>
                </Box>
              );
            }}
            sx={{
              fontSize: "0.72rem",
              "& .MuiSelect-select": { py: "0px !important", pl: "4px !important", pr: "20px !important", display: "flex", alignItems: "center" },
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

        <VerticalDivider />

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
              height: 28,
              borderRadius: 1,
              "&:hover": { backgroundColor: isDark ? "#4e5157" : "#e0e0e0" },
            }}
          >
            {proxyMode === "local" ? (
              <Lan sx={{ fontSize: 13, color: localAvailable ? theme.palette.success.main : theme.palette.error.main }} />
            ) : (
              <Cloud sx={{ fontSize: 13, color: theme.palette.text.secondary }} />
            )}
            <Typography variant="caption" sx={{ fontSize: "0.72rem", fontWeight: 400 }}>
              {t(`proxyMode.${proxyMode}`)}
            </Typography>
          </Box>
        </Tooltip>

        <Box sx={{ flexGrow: 1 }} />

        {/* Right actions */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0 }}>
          {username && (
            <Typography
              variant="body2"
              sx={{
                fontSize: "0.75rem",
                color: theme.palette.text.secondary,
                mr: 0.5,
              }}
            >
              {username}
            </Typography>
          )}

          {/* Language */}
          <FormControl size="small">
            <Select
              value={i18n.language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              variant="standard"
              disableUnderline
              renderValue={(value) => {
                const lang = LANGUAGES.find((l) => l.code === value);
                return lang ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <img
                      src={`https://flagcdn.com/w40/${lang.flag}.png`}
                      alt={lang.label}
                      style={{ width: 16, height: 11, objectFit: "cover", borderRadius: 1 }}
                    />
                    <Typography variant="caption" sx={{ fontWeight: 500, fontSize: "0.7rem" }}>
                      {lang.code.toUpperCase()}
                    </Typography>
                  </Box>
                ) : value;
              }}
              sx={{
                minWidth: 50,
                cursor: "pointer",
                "& .MuiSelect-select": {
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  py: "2px !important",
                  pl: "4px !important",
                  pr: "20px !important",
                },
              }}
            >
              {LANGUAGES.map((lang) => (
                <MenuItem key={lang.code} value={lang.code}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <img
                      src={`https://flagcdn.com/w40/${lang.flag}.png`}
                      alt={lang.label}
                      style={{ width: 18, height: 12, objectFit: "cover", borderRadius: 1 }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 400 }}>
                      {lang.label}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Theme toggle */}
          <Tooltip title={mode === "dark" ? t("common.lightMode") : t("common.darkMode")}>
            <IconButton
              onClick={onToggleTheme}
              size="small"
              sx={{
                width: 28,
                height: 28,
                borderRadius: 1,
                color: theme.palette.text.secondary,
                "&:hover": { color: theme.palette.text.primary },
              }}
            >
              {mode === "dark" ? <LightMode sx={{ fontSize: 16 }} /> : <DarkMode sx={{ fontSize: 16 }} />}
            </IconButton>
          </Tooltip>

          {/* Logout */}
          <Tooltip title={t("auth.logout")}>
            <IconButton
              onClick={onLogout}
              size="small"
              sx={{
                width: 28,
                height: 28,
                borderRadius: 1,
                color: theme.palette.text.secondary,
                "&:hover": { color: theme.palette.error.main },
              }}
            >
              <Logout sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

function VerticalDivider() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  return (
    <Box
      sx={{
        width: "1px",
        height: 18,
        backgroundColor: isDark ? "#4e5157" : "#c4c4c4",
        mx: 0.5,
        flexShrink: 0,
      }}
    />
  );
}
