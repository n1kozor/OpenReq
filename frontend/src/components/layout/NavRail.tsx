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
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";

const NAVRAIL_COLLAPSED_WIDTH = 40;
const NAVRAIL_EXPANDED_WIDTH = 180;
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
    { id: "workspaces", icon: <Workspaces sx={{ fontSize: 22 }} />, label: t("nav.workspace"), onClick: onOpenWorkspaces },
    { id: "environments", icon: <Dns sx={{ fontSize: 22 }} />, label: t("nav.environments"), onClick: onOpenEnvironments },
    { id: "history", icon: <History sx={{ fontSize: 22 }} />, label: t("nav.history"), onClick: onOpenHistory },
    { id: "testBuilder", icon: <AccountTree sx={{ fontSize: 22 }} />, label: t("nav.testBuilder"), onClick: onOpenTestBuilder },
    { id: "import", icon: <SwapHoriz sx={{ fontSize: 22 }} />, label: t("importExport.title"), onClick: onOpenImport },
    { id: "sdk", icon: <FileDownload sx={{ fontSize: 22 }} />, label: t("sdk.title"), onClick: onOpenSDK },
    { id: "aiAgent", icon: <SmartToy sx={{ fontSize: 22 }} />, label: t("nav.aiAgent"), onClick: onOpenAIAgent },
  ];

  const renderItem = (item: NavItemDef, isActive: boolean) => (
    <Tooltip key={item.id} title={collapsed ? item.label : ""} placement="right" arrow>
      <Box
        onClick={item.onClick}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          height: 32,
          px: collapsed ? 0 : 1,
          mx: 0.5,
          borderRadius: 1,
          cursor: "pointer",
          justifyContent: collapsed ? "center" : "flex-start",
          bgcolor: isActive ? alpha(theme.palette.primary.main, 0.15) : "transparent",
          color: isActive ? theme.palette.primary.main : theme.palette.text.secondary,
          "&:hover": {
            bgcolor: isActive
              ? alpha(theme.palette.primary.main, 0.22)
              : alpha(theme.palette.text.primary, 0.06),
          },
        }}
      >
        {item.icon}
        {!collapsed && (
          <Typography
            noWrap
            sx={{ fontSize: "0.9rem", fontWeight: 500, lineHeight: 1 }}
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
        transition: "width 200ms cubic-bezier(0.4, 0, 0.2, 1), min-width 200ms cubic-bezier(0.4, 0, 0.2, 1)",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        borderRight: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
        bgcolor: isDark ? "#0a0e14" : "#f5f6f8",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <Toolbar sx={{ minHeight: "52px !important" }} />

      {/* Collapse toggle */}
      <Box sx={{ display: "flex", justifyContent: collapsed ? "center" : "flex-end", px: 0.25, py: 0.25 }}>
        <Tooltip title={collapsed ? t("nav.expandNav") : t("nav.collapseNav")} placement="right" arrow>
          <IconButton size="small" onClick={toggleCollapse} sx={{ color: "text.secondary", p: 0.5 }}>
            {collapsed ? <ChevronRight sx={{ fontSize: 15 }} /> : <ChevronLeft sx={{ fontSize: 15 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Collections toggle */}
      {renderItem(
        { id: "collections", icon: <FolderOpen sx={{ fontSize: 22 }} />, label: t("nav.collections"), onClick: onToggleCollections },
        showCollectionsSidebar,
      )}

      <Divider sx={{ my: 0.5, mx: 0.75 }} />

      {/* Main nav items */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {navItems.map((item) => renderItem(item, activeNavItem === item.id))}
      </Box>

      {/* Spacer */}
      <Box sx={{ flexGrow: 1 }} />

      {/* Settings pinned to bottom */}
      <Divider sx={{ mx: 0.75 }} />
      <Box sx={{ py: 0.5 }}>
        {renderItem(
          { id: "settings", icon: <Settings sx={{ fontSize: 22 }} />, label: t("nav.settings"), onClick: onOpenSettings },
          activeNavItem === "settings",
        )}
      </Box>
    </Box>
  );
}
