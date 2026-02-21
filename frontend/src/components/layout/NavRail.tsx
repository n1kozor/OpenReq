import { useState } from "react";
import {
  Box,
  Toolbar,
  IconButton,
  Divider,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  FolderOpen,
  Workspaces,
  Dns,
  History,
  AccountTree,
  SwapHoriz,
  FileDownload,
  SmartToy,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "@mui/icons-material";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

const NAVRAIL_COLLAPSED_WIDTH = 40;
const NAVRAIL_EXPANDED_WIDTH = 170;
const NAVRAIL_STORAGE_KEY = "openreq-navrail-collapsed";

interface NavRailProps {
  showCollectionsSidebar: boolean;
  onToggleCollections: () => void;
  onOpenWorkspaces: () => void;
  onOpenEnvironments: () => void;
  onOpenHistory: () => void;
  onOpenTestBuilder: () => void;
  onOpenImport: () => void;
  onOpenSDK: () => void;
  onOpenAIAgent: () => void;
  onOpenSettings: () => void;
  activeNavItem: "settings" | "aiAgent" | null;
}

interface NavItemDef {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

export default function NavRail({
  showCollectionsSidebar,
  onToggleCollections,
  onOpenWorkspaces,
  onOpenEnvironments,
  onOpenHistory,
  onOpenTestBuilder,
  onOpenImport,
  onOpenSDK,
  onOpenAIAgent,
  onOpenSettings,
  activeNavItem,
}: NavRailProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(NAVRAIL_STORAGE_KEY) === "true";
  });

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(NAVRAIL_STORAGE_KEY, String(next));
      return next;
    });
  };

  const width = collapsed ? NAVRAIL_COLLAPSED_WIDTH : NAVRAIL_EXPANDED_WIDTH;

  const navItems: NavItemDef[] = [
    { id: "workspaces", icon: <Workspaces sx={{ fontSize: 18 }} />, label: t("nav.workspace"), onClick: onOpenWorkspaces },
    { id: "environments", icon: <Dns sx={{ fontSize: 18 }} />, label: t("nav.environments"), onClick: onOpenEnvironments },
    { id: "history", icon: <History sx={{ fontSize: 18 }} />, label: t("nav.history"), onClick: onOpenHistory },
    { id: "testBuilder", icon: <AccountTree sx={{ fontSize: 18 }} />, label: t("nav.testBuilder"), onClick: onOpenTestBuilder },
    { id: "import", icon: <SwapHoriz sx={{ fontSize: 18 }} />, label: t("importExport.title"), onClick: onOpenImport },
    { id: "sdk", icon: <FileDownload sx={{ fontSize: 18 }} />, label: t("sdk.title"), onClick: onOpenSDK },
    { id: "aiAgent", icon: <SmartToy sx={{ fontSize: 18 }} />, label: t("nav.aiAgent"), onClick: onOpenAIAgent },
  ];

  const renderItem = (item: NavItemDef, isActive: boolean) => (
    <Tooltip key={item.id} title={collapsed ? item.label : ""} placement="right">
      <Box
        onClick={item.onClick}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          height: 28,
          px: collapsed ? 0 : 0.75,
          cursor: "pointer",
          justifyContent: collapsed ? "center" : "flex-start",
          borderLeft: isActive ? `2px solid ${theme.palette.primary.main}` : "2px solid transparent",
          bgcolor: isActive
            ? (isDark ? "#2d4a6e" : "#cce0f5")
            : "transparent",
          color: isActive ? theme.palette.primary.main : theme.palette.text.secondary,
          "&:hover": {
            bgcolor: isDark ? "#393b40" : "#e0e0e0",
          },
        }}
      >
        {item.icon}
        {!collapsed && (
          <Typography
            noWrap
            sx={{ fontSize: "0.78rem", fontWeight: isActive ? 500 : 400, lineHeight: 1 }}
          >
            {item.label}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );

  return (
    <Box
      sx={{
        width,
        minWidth: width,
        transition: "width 150ms ease, min-width 150ms ease",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid ${isDark ? "#4e5157" : "#d1d1d1"}`,
        bgcolor: isDark ? "#2b2d30" : "#f0f0f0",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <Toolbar sx={{ minHeight: "40px !important" }} />

      {/* Collapse toggle */}
      <Box sx={{ display: "flex", justifyContent: collapsed ? "center" : "flex-end", px: 0.25, py: 0.25 }}>
        <Tooltip title={collapsed ? t("nav.expandNav") : t("nav.collapseNav")} placement="right">
          <IconButton size="small" onClick={toggleCollapse} sx={{ color: "text.secondary", p: 0.25, borderRadius: 0 }}>
            {collapsed ? <ChevronRight sx={{ fontSize: 14 }} /> : <ChevronLeft sx={{ fontSize: 14 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Collections toggle */}
      {renderItem(
        { id: "collections", icon: <FolderOpen sx={{ fontSize: 18 }} />, label: t("nav.collections"), onClick: onToggleCollections },
        showCollectionsSidebar,
      )}

      <Divider sx={{ my: 0.25 }} />

      {/* Main nav items */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {navItems.map((item) => renderItem(item, activeNavItem === item.id))}
      </Box>

      <Box sx={{ flexGrow: 1 }} />

      <Divider />
      <Box sx={{ py: 0.25 }}>
        {renderItem(
          { id: "settings", icon: <Settings sx={{ fontSize: 18 }} />, label: t("nav.settings"), onClick: onOpenSettings },
          activeNavItem === "settings",
        )}
      </Box>
    </Box>
  );
}
