import { useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Select,
  MenuItem,
  Tooltip,
  FormControl,
  TextField,
  InputAdornment,
  ListSubheader,
} from "@mui/material";
import {
  Workspaces,
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
  Send,
  Save,
  Add,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Environment, Workspace } from "@/types";

interface TopBarProps {
  mode: "dark" | "light";
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  environments: Environment[];
  selectedEnvironmentId: string | null;
  onSelectEnvironment: (id: string | null) => void;
  // Quick actions
  showCollectionsSidebar: boolean;
  onToggleCollections: () => void;
  onOpenHistory: () => void;
  onOpenTestBuilder: () => void;
  onOpenImport: () => void;
  onOpenSDK: () => void;
  onOpenAIAgent: () => void;
  onOpenSettings: () => void;
  onNewTab: () => void;
  onSave: () => void;
  onSend: () => void;
  hasActiveTab: boolean;
  loading: boolean;
  activeNavItem: "settings" | "aiAgent" | null;
}

const ENV_COLORS: Record<string, string> = {
  LIVE: "#cf5b56",
  TEST: "#e9b84a",
  DEV: "#59a869",
};

export default function TopBar({
  mode,
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
  onNewTab,
  onSave,
  onSend,
  hasActiveTab,
  loading,
  activeNavItem,
}: TopBarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = mode === "dark";
  const [wsSearch, setWsSearch] = useState("");

  const currentWs = workspaces.find((w) => w.id === currentWorkspaceId);
  const currentEnv = environments.find((e) => e.id === selectedEnvironmentId);

  const iconBtnSx = (active: boolean = false) => ({
    width: 26,
    height: 26,
    borderRadius: 0.75,
    color: active ? theme.palette.primary.main : theme.palette.text.secondary,
    backgroundColor: active ? (isDark ? "#2d4a6e" : "#cce0f5") : "transparent",
    "&:hover": {
      color: theme.palette.primary.main,
      backgroundColor: isDark ? "#4e5157" : "#e0e0e0",
    },
  });

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        height: 34,
        minHeight: 34,
        maxHeight: 34,
        borderBottom: `1px solid ${isDark ? "#393b40" : "#d1d1d1"}`,
        backgroundColor: isDark ? "#3c3f41" : "#f7f8fa",
        color: theme.palette.text.primary,
        px: 0.5,
        gap: 0.25,
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Quick action buttons */}
      <Tooltip title={t("menu.newHttpRequest") + " (Ctrl+N)"}>
        <IconButton size="small" onClick={onNewTab} sx={iconBtnSx()}>
          <Add sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("menu.save") + " (Ctrl+S)"}>
        <span>
          <IconButton size="small" onClick={onSave} disabled={!hasActiveTab} sx={iconBtnSx()}>
            <Save sx={{ fontSize: 15 }} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t("menu.sendRequest") + " (Ctrl+Enter)"}>
        <span>
          <IconButton
            size="small"
            onClick={onSend}
            disabled={!hasActiveTab || loading}
            sx={{
              ...iconBtnSx(),
              color: hasActiveTab ? theme.palette.success.main : theme.palette.text.secondary,
              "&:hover": {
                color: theme.palette.success.main,
                backgroundColor: isDark ? "#2a3a2a" : "#e0f0e0",
              },
            }}
          >
            <Send sx={{ fontSize: 15 }} />
          </IconButton>
        </span>
      </Tooltip>

      <VerticalDivider isDark={isDark} />

      {/* Navigation buttons */}
      <Tooltip title={t("nav.collections") + " (Ctrl+B)"}>
        <IconButton size="small" onClick={onToggleCollections} sx={iconBtnSx(showCollectionsSidebar)}>
          <FolderOpen sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("nav.history")}>
        <IconButton size="small" onClick={onOpenHistory} sx={iconBtnSx()}>
          <History sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("nav.testBuilder")}>
        <IconButton size="small" onClick={onOpenTestBuilder} sx={iconBtnSx()}>
          <AccountTree sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("importExport.title")}>
        <IconButton size="small" onClick={onOpenImport} sx={iconBtnSx()}>
          <SwapHoriz sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("sdk.title")}>
        <IconButton size="small" onClick={onOpenSDK} sx={iconBtnSx()}>
          <FileDownload sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("nav.aiAgent")}>
        <IconButton size="small" onClick={onOpenAIAgent} sx={iconBtnSx(activeNavItem === "aiAgent")}>
          <SmartToy sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title={t("nav.settings")}>
        <IconButton size="small" onClick={onOpenSettings} sx={iconBtnSx(activeNavItem === "settings")}>
          <Settings sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>

      <VerticalDivider isDark={isDark} />

      {/* Workspace selector */}
      <FormControl size="small" sx={{ minWidth: 130, flexShrink: 0 }}>
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

      <VerticalDivider isDark={isDark} />

      {/* Environment selector */}
      <FormControl size="small" sx={{ minWidth: 110, flexShrink: 0 }}>
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

      <Box sx={{ flexGrow: 1 }} />
    </Box>
  );
}

function VerticalDivider({ isDark }: { isDark: boolean }) {
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
