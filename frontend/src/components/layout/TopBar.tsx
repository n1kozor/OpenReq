import { useState } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Button,
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
import useMediaQuery from "@mui/material/useMediaQuery";
import { useProxyMode } from "@/hooks/useProxyMode";
import type { Environment, Workspace } from "@/types";

declare const __APP_VERSION__: string;

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
  const { t } = useTranslation();
  const theme = useTheme();
  const showNavLabels = useMediaQuery("(min-width: 1400px)");
  const isDark = mode === "dark";
  const { proxyMode, setProxyMode, localAvailable } = useProxyMode();
  const [wsSearch, setWsSearch] = useState("");

  const currentWs = workspaces.find((w) => w.id === currentWorkspaceId);
  const currentEnv = environments.find((e) => e.id === selectedEnvironmentId);

  const navBtnSx = (active: boolean) => ({
    minWidth: showNavLabels ? 0 : 28,
    height: 28,
    px: showNavLabels ? 0.2 : 0,
    borderRadius: 1,
    color: active ? theme.palette.primary.main : theme.palette.text.secondary,
    backgroundColor: active ? (isDark ? "#2d4a6e" : "#cce0f5") : "transparent",
    textTransform: "none",
    fontSize: "0.72rem",
    gap: 0.15,
    "&:hover": {
      color: theme.palette.primary.main,
      backgroundColor: isDark ? "#4e5157" : "#e0e0e0",
    },
    "& .nav-label": {
      display: showNavLabels ? "inline" : "none",
      whiteSpace: "nowrap",
    },
    "& .MuiButton-startIcon": {
      marginRight: showNavLabels ? 1 : 0,
      marginLeft: 0,
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
          flexWrap: "nowrap",
          overflow: "hidden",
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, minWidth: 0, flexShrink: 1, overflow: "hidden" }}>
          <Tooltip title={t("nav.collections")}>
            <Button size="small" onClick={onToggleCollections} sx={navBtnSx(showCollectionsSidebar)} startIcon={<FolderOpen sx={{ fontSize: 16 }} />}>
              <span className="nav-label">{t("nav.collections")}</span>
            </Button>
          </Tooltip>
          <Tooltip title={t("nav.workspace")}>
            <Button size="small" onClick={onOpenWorkspaceManager} sx={navBtnSx(false)} startIcon={<Workspaces sx={{ fontSize: 16 }} />}>
              <span className="nav-label">{t("nav.workspace")}</span>
            </Button>
          </Tooltip>
          <Tooltip title={t("nav.environments")}>
            <Button size="small" onClick={onOpenEnvironmentManager} sx={navBtnSx(false)} startIcon={<Cloud sx={{ fontSize: 16 }} />}>
              <span className="nav-label">{t("nav.environments")}</span>
            </Button>
          </Tooltip>
          <Tooltip title={t("nav.history")}>
            <Button size="small" onClick={onOpenHistory} sx={navBtnSx(false)} startIcon={<History sx={{ fontSize: 16 }} />}>
              <span className="nav-label">{t("nav.history")}</span>
            </Button>
          </Tooltip>
          <Tooltip title={t("nav.testBuilder")}>
            <Button size="small" onClick={onOpenTestBuilder} sx={navBtnSx(false)} startIcon={<AccountTree sx={{ fontSize: 16 }} />}>
              <span className="nav-label">{t("nav.testBuilder")}</span>
            </Button>
          </Tooltip>
          <Tooltip title={t("importExport.title")}>
            <Button size="small" onClick={onOpenImport} sx={navBtnSx(false)} startIcon={<SwapHoriz sx={{ fontSize: 16 }} />}>
              <span className="nav-label">{t("importExport.title")}</span>
            </Button>
          </Tooltip>
          <Tooltip title={t("sdk.title")}>
            <Button size="small" onClick={onOpenSDK} sx={navBtnSx(false)} startIcon={<FileDownload sx={{ fontSize: 16 }} />}>
              <span className="nav-label">{t("sdk.title")}</span>
            </Button>
          </Tooltip>
          <Tooltip title={t("nav.aiAgent")}>
            <Button size="small" onClick={onOpenAIAgent} sx={navBtnSx(activeNavItem === "aiAgent")} startIcon={<SmartToy sx={{ fontSize: 16 }} />}>
              <span className="nav-label">{t("nav.aiAgent")}</span>
            </Button>
          </Tooltip>
          <Tooltip title={t("nav.settings")}>
            <Button size="small" onClick={onOpenSettings} sx={navBtnSx(activeNavItem === "settings")} startIcon={<Settings sx={{ fontSize: 16 }} />}>
              <span className="nav-label">{t("nav.settings")}</span>
            </Button>
          </Tooltip>
        </Box>

        <VerticalDivider />

        {/* Workspace selector */}
        <FormControl size="small" sx={{ minWidth: 140, flexShrink: 0 }}>
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
        <FormControl size="small" sx={{ minWidth: 120, flexShrink: 0 }}>
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

        <Box sx={{ flexGrow: 1, minWidth: 8 }} />

        {/* Right actions */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontSize: "0.75rem",
              color: theme.palette.text.secondary,
              mr: 0.5,
            }}
          >
            v{__APP_VERSION__}
          </Typography>
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
