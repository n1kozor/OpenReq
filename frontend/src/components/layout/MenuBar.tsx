import { useState, useCallback, useRef, useEffect } from "react";
import {
  Box,
  Menu,
  MenuItem,
  MenuList,
  Divider,
  Typography,
  ListItemIcon,
  ListItemText,
  Popper,
  Paper,
} from "@mui/material";
import {
  Http,
  Cable,
  Hub,
  CreateNewFolder,
  Save,
  SaveAs,
  FileDownload,
  FileUpload,
  Settings,
  ExitToApp,
  Search,
  FindReplace,
  ContentCopy,
  FolderOpen,
  DarkMode,
  LightMode,
  Fullscreen,
  FullscreenExit,
  ZoomIn,
  ZoomOut,
  Send,
  PlayArrow,
  AccountTree,
  SmartToy,
  AutoFixHigh,
  Code,
  Cloud,
  Workspaces,
  Close,
  CloseFullscreen,
  Delete,
  History,
  Keyboard,
  School,
  Info,
  Language,
  Check,
  ChevronRight,
  FiberManualRecord,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Workspace, Environment } from "@/types";

declare const __APP_VERSION__: string;

const ENV_COLORS: Record<string, string> = {
  LIVE: "#cf5b56",
  TEST: "#e9b84a",
  DEV: "#59a869",
};

interface MenuBarProps {
  mode: "dark" | "light";
  // File actions
  onNewHttp: () => void;
  onNewWebSocket: () => void;
  onNewGraphQL: () => void;
  onNewCollection: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onImport: () => void;
  onExport: () => void;
  onSettings: () => void;
  onLogout: () => void;
  // Edit actions
  onCopyUrl: () => void;
  // View actions
  showSidebar: boolean;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  // Tools actions
  onSendRequest: () => void;
  onCollectionRunner: () => void;
  onTestBuilder: () => void;
  onAIWizard: () => void;
  onAIAgent: () => void;
  onSDKGenerator: () => void;
  onEnvironmentManager: () => void;
  // Window actions
  onWorkspaceManager: () => void;
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  environments: Environment[];
  selectedEnvironmentId: string | null;
  onSelectEnvironment: (id: string | null) => void;
  onCloseTab: () => void;
  onCloseOtherTabs: () => void;
  onCloseAllTabs: () => void;
  onHistory: () => void;
  // Help actions
  onKeyboardShortcuts: () => void;
  learningMode: boolean;
  onToggleLearningMode: () => void;
  onAbout: () => void;
  hasActiveTab: boolean;
}

type MenuId = "file" | "edit" | "view" | "tools" | "window" | "help" | null;

export default function MenuBar(props: MenuBarProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isDark = props.mode === "dark";
  const [activeMenu, setActiveMenu] = useState<MenuId>(null);
  const anchorRefs = useRef<Record<string, HTMLElement | null>>({});
  const [wsSubmenu, setWsSubmenu] = useState<HTMLElement | null>(null);
  const [themeSubmenu, setThemeSubmenu] = useState<HTMLElement | null>(null);
  const [langSubmenu, setLangSubmenu] = useState<HTMLElement | null>(null);
  const [envSubmenu, setEnvSubmenu] = useState<HTMLElement | null>(null);

  // Timeout refs for delayed submenu close (prevents flickering when moving mouse to submenu)
  const wsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const themeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const langTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const envTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submenuDelay = 120;

  const openSubmenu = useCallback(
    (
      setter: (el: HTMLElement | null) => void,
      timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
      el: HTMLElement,
    ) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setter(el);
    },
    [],
  );

  const closeSubmenuDelayed = useCallback(
    (
      setter: (el: HTMLElement | null) => void,
      timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    ) => {
      timeoutRef.current = setTimeout(() => {
        setter(null);
        timeoutRef.current = null;
      }, submenuDelay);
    },
    [],
  );

  const cancelSubmenuClose = useCallback(
    (timeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    },
    [],
  );

  const menus: { id: MenuId; label: string }[] = [
    { id: "file", label: t("menu.file") },
    { id: "edit", label: t("menu.edit") },
    { id: "view", label: t("menu.view") },
    { id: "tools", label: t("menu.tools") },
    { id: "window", label: t("menu.window") },
    { id: "help", label: t("menu.help") },
  ];

  const handleMenuClick = useCallback((id: MenuId) => {
    setActiveMenu((prev) => (prev === id ? null : id));
  }, []);

  const handleMenuHover = useCallback((id: MenuId) => {
    if (activeMenu !== null) {
      setActiveMenu(id);
    }
  }, [activeMenu]);

  const closeAll = useCallback(() => {
    setActiveMenu(null);
    setWsSubmenu(null);
    setThemeSubmenu(null);
    setLangSubmenu(null);
    setEnvSubmenu(null);
    // Clear any pending submenu timeouts
    for (const ref of [wsTimeout, themeTimeout, langTimeout, envTimeout]) {
      if (ref.current) { clearTimeout(ref.current); ref.current = null; }
    }
  }, []);

  const act = useCallback((fn: () => void) => {
    closeAll();
    fn();
  }, [closeAll]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [closeAll]);

  const menuItemSx = {
    fontSize: "0.82rem",
    minHeight: 30,
    py: 0.25,
    px: 1.5,
  };

  const shortcutSx = {
    fontSize: "0.72rem",
    color: "text.secondary",
    ml: 3,
    fontFamily: "'JetBrains Mono', monospace",
    flexShrink: 0,
  };

  const menuPaperSx = {
    minWidth: 240,
    "& .MuiMenuItem-root": menuItemSx,
  };

  const languages = [
    { code: "en", label: "English" },
    { code: "de", label: "Deutsch" },
    { code: "hu", label: "Magyar" },
  ];

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        height: 28,
        backgroundColor: isDark ? "#2b2d30" : "#f0f0f0",
        borderBottom: `1px solid ${isDark ? "#1e1f22" : "#d1d1d1"}`,
        px: 0.5,
        gap: 0,
        flexShrink: 0,
        zIndex: theme.zIndex.drawer + 2,
        position: "relative",
        userSelect: "none",
      }}
    >
      {/* Logo */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 0.75, mr: 0.5 }}>
        <Box
          component="img"
          src="/logo.png"
          alt="OpenReq"
          sx={{ width: 16, height: 16 }}
        />
      </Box>

      {/* Menu buttons */}
      {menus.map((m) => (
        <Box
          key={m.id}
          ref={(el: HTMLElement | null) => { anchorRefs.current[m.id!] = el; }}
          onClick={() => handleMenuClick(m.id)}
          onMouseEnter={() => handleMenuHover(m.id)}
          sx={{
            px: 1,
            py: 0.25,
            cursor: "pointer",
            borderRadius: 0.5,
            fontSize: "0.82rem",
            color: activeMenu === m.id ? (isDark ? "#fff" : "#000") : "text.primary",
            backgroundColor: activeMenu === m.id
              ? (isDark ? "#4a88c7" : "#cce0f5")
              : "transparent",
            "&:hover": {
              backgroundColor: activeMenu === m.id
                ? (isDark ? "#4a88c7" : "#cce0f5")
                : (isDark ? "#3c3f41" : "#e0e0e0"),
            },
            transition: "background-color 0.1s ease",
          }}
        >
          {m.label}
        </Box>
      ))}

      {/* Spacer */}
      <Box sx={{ flexGrow: 1 }} />

      {/* Right side: version */}
      <Typography
        variant="caption"
        sx={{ fontSize: "0.68rem", color: "text.secondary", mr: 0.75 }}
      >
        v{__APP_VERSION__}
      </Typography>

      {/* ═══ FILE MENU ═══ */}
      <Menu
        open={activeMenu === "file"}
        anchorEl={anchorRefs.current.file}
        onClose={closeAll}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: menuPaperSx } }}
        disableAutoFocusItem
      >
        <MenuItem onClick={() => act(props.onNewHttp)}>
          <ListItemIcon><Http sx={{ fontSize: 16, color: "#34d399" }} /></ListItemIcon>
          <ListItemText>{t("menu.newHttpRequest")}</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+N</Typography>
        </MenuItem>
        <MenuItem onClick={() => act(props.onNewWebSocket)}>
          <ListItemIcon><Cable sx={{ fontSize: 16, color: "#14b8a6" }} /></ListItemIcon>
          <ListItemText>{t("menu.newWebSocket")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => act(props.onNewGraphQL)}>
          <ListItemIcon><Hub sx={{ fontSize: 16, color: "#e879f9" }} /></ListItemIcon>
          <ListItemText>{t("menu.newGraphQL")}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => act(props.onNewCollection)}>
          <ListItemIcon><CreateNewFolder sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.newCollection")}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => act(props.onSave)} disabled={!props.hasActiveTab}>
          <ListItemIcon><Save sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.save")}</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+S</Typography>
        </MenuItem>
        <MenuItem onClick={() => act(props.onSaveAs)} disabled={!props.hasActiveTab}>
          <ListItemIcon><SaveAs sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.saveAs")}</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+Shift+S</Typography>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => act(props.onImport)}>
          <ListItemIcon><FileUpload sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.import")}</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+I</Typography>
        </MenuItem>
        <MenuItem onClick={() => act(props.onExport)}>
          <ListItemIcon><FileDownload sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.export")}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => act(props.onSettings)}>
          <ListItemIcon><Settings sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.settings")}</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+,</Typography>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => act(props.onLogout)}>
          <ListItemIcon><ExitToApp sx={{ fontSize: 16, color: theme.palette.error.main }} /></ListItemIcon>
          <ListItemText sx={{ "& .MuiTypography-root": { color: theme.palette.error.main } }}>{t("menu.exit")}</ListItemText>
        </MenuItem>
      </Menu>

      {/* ═══ EDIT MENU ═══ */}
      <Menu
        open={activeMenu === "edit"}
        anchorEl={anchorRefs.current.edit}
        onClose={closeAll}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: menuPaperSx } }}
        disableAutoFocusItem
      >
        <MenuItem onClick={() => { closeAll(); document.execCommand("selectAll"); }}>
          <ListItemIcon><Search sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.find")}</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+F</Typography>
        </MenuItem>
        <MenuItem onClick={() => closeAll()}>
          <ListItemIcon><FindReplace sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.replace")}</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+H</Typography>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => act(props.onCopyUrl)} disabled={!props.hasActiveTab}>
          <ListItemIcon><ContentCopy sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.copyRequestUrl")}</ListItemText>
        </MenuItem>
      </Menu>

      {/* ═══ VIEW MENU ═══ */}
      <Menu
        open={activeMenu === "view"}
        anchorEl={anchorRefs.current.view}
        onClose={closeAll}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: menuPaperSx } }}
        disableAutoFocusItem
      >
        <MenuItem onClick={() => act(props.onToggleSidebar)}>
          <ListItemIcon><FolderOpen sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.collectionsSidebar")}</ListItemText>
          {props.showSidebar && <Check sx={{ fontSize: 14, ml: 1, color: "primary.main" }} />}
          <Typography sx={shortcutSx}>Ctrl+B</Typography>
        </MenuItem>
        <Divider />
        {/* Theme submenu */}
        <MenuItem
          onMouseEnter={(e) => openSubmenu(setThemeSubmenu, themeTimeout, e.currentTarget)}
          onMouseLeave={() => closeSubmenuDelayed(setThemeSubmenu, themeTimeout)}
        >
          <ListItemIcon>{isDark ? <DarkMode sx={{ fontSize: 16 }} /> : <LightMode sx={{ fontSize: 16 }} />}</ListItemIcon>
          <ListItemText>{t("menu.theme")}</ListItemText>
          <ChevronRight sx={{ fontSize: 14, ml: 1 }} />
        </MenuItem>
        <Popper open={!!themeSubmenu} anchorEl={themeSubmenu} placement="right-start" sx={{ zIndex: theme.zIndex.modal + 1 }}>
          <Paper
            elevation={8}
            sx={{ minWidth: 160 }}
            onMouseEnter={() => cancelSubmenuClose(themeTimeout)}
            onMouseLeave={() => closeSubmenuDelayed(setThemeSubmenu, themeTimeout)}
          >
            <MenuList dense>
              <MenuItem onClick={() => { if (isDark) props.onToggleTheme(); closeAll(); }} sx={menuItemSx}>
                <ListItemIcon><LightMode sx={{ fontSize: 16 }} /></ListItemIcon>
                <ListItemText>{t("menu.lightTheme")}</ListItemText>
                {!isDark && <Check sx={{ fontSize: 14, ml: 1, color: "primary.main" }} />}
              </MenuItem>
              <MenuItem onClick={() => { if (!isDark) props.onToggleTheme(); closeAll(); }} sx={menuItemSx}>
                <ListItemIcon><DarkMode sx={{ fontSize: 16 }} /></ListItemIcon>
                <ListItemText>{t("menu.darkTheme")}</ListItemText>
                {isDark && <Check sx={{ fontSize: 14, ml: 1, color: "primary.main" }} />}
              </MenuItem>
            </MenuList>
          </Paper>
        </Popper>
        <Divider />
        <MenuItem onClick={() => act(props.onToggleFullScreen)}>
          <ListItemIcon>{props.isFullScreen ? <FullscreenExit sx={{ fontSize: 16 }} /> : <Fullscreen sx={{ fontSize: 16 }} />}</ListItemIcon>
          <ListItemText>{props.isFullScreen ? t("menu.exitFullScreen") : t("menu.fullScreen")}</ListItemText>
          <Typography sx={shortcutSx}>F11</Typography>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => act(props.onZoomIn)}>
          <ListItemIcon><ZoomIn sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.zoomIn")}</ListItemText>
          <Typography sx={shortcutSx}>Ctrl++</Typography>
        </MenuItem>
        <MenuItem onClick={() => act(props.onZoomOut)}>
          <ListItemIcon><ZoomOut sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.zoomOut")}</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+-</Typography>
        </MenuItem>
      </Menu>

      {/* ═══ TOOLS MENU ═══ */}
      <Menu
        open={activeMenu === "tools"}
        anchorEl={anchorRefs.current.tools}
        onClose={closeAll}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: menuPaperSx } }}
        disableAutoFocusItem
      >
        <MenuItem onClick={() => act(props.onSendRequest)} disabled={!props.hasActiveTab}>
          <ListItemIcon><Send sx={{ fontSize: 16, color: theme.palette.success.main }} /></ListItemIcon>
          <ListItemText>{t("menu.sendRequest")}</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+Enter</Typography>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => act(props.onCollectionRunner)}>
          <ListItemIcon><PlayArrow sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.collectionRunner")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => act(props.onTestBuilder)}>
          <ListItemIcon><AccountTree sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.testBuilder")}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => act(props.onAIWizard)}>
          <ListItemIcon><AutoFixHigh sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.aiCollectionWizard")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => act(props.onAIAgent)}>
          <ListItemIcon><SmartToy sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.aiAgent")}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => act(props.onSDKGenerator)}>
          <ListItemIcon><Code sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.sdkGenerator")}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => act(props.onEnvironmentManager)}>
          <ListItemIcon><Cloud sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.environmentManager")}</ListItemText>
        </MenuItem>
      </Menu>

      {/* ═══ WINDOW MENU ═══ */}
      <Menu
        open={activeMenu === "window"}
        anchorEl={anchorRefs.current.window}
        onClose={closeAll}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: menuPaperSx } }}
        disableAutoFocusItem
      >
        <MenuItem onClick={() => act(props.onWorkspaceManager)}>
          <ListItemIcon><Workspaces sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.workspaceManager")}</ListItemText>
        </MenuItem>
        {/* Workspace switcher submenu */}
        {props.workspaces.length > 1 && (
          <>
            <MenuItem
              onMouseEnter={(e) => openSubmenu(setWsSubmenu, wsTimeout, e.currentTarget)}
              onMouseLeave={() => closeSubmenuDelayed(setWsSubmenu, wsTimeout)}
            >
              <ListItemIcon><Workspaces sx={{ fontSize: 16 }} /></ListItemIcon>
              <ListItemText>{t("menu.switchWorkspace")}</ListItemText>
              <ChevronRight sx={{ fontSize: 14, ml: 1 }} />
            </MenuItem>
            <Popper open={!!wsSubmenu} anchorEl={wsSubmenu} placement="right-start" sx={{ zIndex: theme.zIndex.modal + 1 }}>
              <Paper
                elevation={8}
                sx={{ minWidth: 180 }}
                onMouseEnter={() => cancelSubmenuClose(wsTimeout)}
                onMouseLeave={() => closeSubmenuDelayed(setWsSubmenu, wsTimeout)}
              >
                <MenuList dense>
                  {props.workspaces.map((ws) => (
                    <MenuItem
                      key={ws.id}
                      onClick={() => { props.onSelectWorkspace(ws.id); closeAll(); }}
                      sx={menuItemSx}
                    >
                      <ListItemText>{ws.name}</ListItemText>
                      {ws.id === props.currentWorkspaceId && (
                        <Check sx={{ fontSize: 14, ml: 1, color: "primary.main" }} />
                      )}
                    </MenuItem>
                  ))}
                </MenuList>
              </Paper>
            </Popper>
          </>
        )}
        {/* Environment switcher submenu */}
        {props.environments.length > 0 && (
          <>
            <MenuItem
              onMouseEnter={(e) => openSubmenu(setEnvSubmenu, envTimeout, e.currentTarget)}
              onMouseLeave={() => closeSubmenuDelayed(setEnvSubmenu, envTimeout)}
            >
              <ListItemIcon><Cloud sx={{ fontSize: 16 }} /></ListItemIcon>
              <ListItemText>{t("menu.switchEnvironment")}</ListItemText>
              <ChevronRight sx={{ fontSize: 14, ml: 1 }} />
            </MenuItem>
            <Popper open={!!envSubmenu} anchorEl={envSubmenu} placement="right-start" sx={{ zIndex: theme.zIndex.modal + 1 }}>
              <Paper
                elevation={8}
                sx={{ minWidth: 180 }}
                onMouseEnter={() => cancelSubmenuClose(envTimeout)}
                onMouseLeave={() => closeSubmenuDelayed(setEnvSubmenu, envTimeout)}
              >
                <MenuList dense>
                  <MenuItem
                    onClick={() => { props.onSelectEnvironment(null); closeAll(); }}
                    sx={menuItemSx}
                  >
                    <ListItemText><em style={{ opacity: 0.6 }}>{t("environment.select")}</em></ListItemText>
                    {!props.selectedEnvironmentId && <Check sx={{ fontSize: 14, ml: 1, color: "primary.main" }} />}
                  </MenuItem>
                  {props.environments.map((env) => (
                    <MenuItem
                      key={env.id}
                      onClick={() => { props.onSelectEnvironment(env.id); closeAll(); }}
                      sx={menuItemSx}
                    >
                      <ListItemIcon>
                        <FiberManualRecord sx={{ fontSize: 8, color: ENV_COLORS[env.env_type] ?? "#888" }} />
                      </ListItemIcon>
                      <ListItemText>{env.name}</ListItemText>
                      {env.id === props.selectedEnvironmentId && (
                        <Check sx={{ fontSize: 14, ml: 1, color: "primary.main" }} />
                      )}
                    </MenuItem>
                  ))}
                </MenuList>
              </Paper>
            </Popper>
          </>
        )}
        <Divider />
        <MenuItem onClick={() => act(props.onHistory)}>
          <ListItemIcon><History sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.history")}</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => act(props.onCloseTab)} disabled={!props.hasActiveTab}>
          <ListItemIcon><Close sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.closeTab")}</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+W</Typography>
        </MenuItem>
        <MenuItem onClick={() => act(props.onCloseOtherTabs)} disabled={!props.hasActiveTab}>
          <ListItemIcon><CloseFullscreen sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.closeOtherTabs")}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => act(props.onCloseAllTabs)} disabled={!props.hasActiveTab}>
          <ListItemIcon><Delete sx={{ fontSize: 16, color: theme.palette.error.main }} /></ListItemIcon>
          <ListItemText>{t("menu.closeAllTabs")}</ListItemText>
        </MenuItem>
      </Menu>

      {/* ═══ HELP MENU ═══ */}
      <Menu
        open={activeMenu === "help"}
        anchorEl={anchorRefs.current.help}
        onClose={closeAll}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: menuPaperSx } }}
        disableAutoFocusItem
      >
        <MenuItem onClick={() => act(props.onKeyboardShortcuts)}>
          <ListItemIcon><Keyboard sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.keyboardShortcuts")}</ListItemText>
          <Typography sx={shortcutSx}>Ctrl+K</Typography>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => act(props.onToggleLearningMode)}>
          <ListItemIcon><School sx={{ fontSize: 16, color: props.learningMode ? theme.palette.info.main : undefined }} /></ListItemIcon>
          <ListItemText>{t("menu.learningMode")}</ListItemText>
          {props.learningMode && <Check sx={{ fontSize: 14, ml: 1, color: "info.main" }} />}
        </MenuItem>
        <Divider />
        {/* Language submenu */}
        <MenuItem
          onMouseEnter={(e) => openSubmenu(setLangSubmenu, langTimeout, e.currentTarget)}
          onMouseLeave={() => closeSubmenuDelayed(setLangSubmenu, langTimeout)}
        >
          <ListItemIcon><Language sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.language")}</ListItemText>
          <ChevronRight sx={{ fontSize: 14, ml: 1 }} />
        </MenuItem>
        <Popper open={!!langSubmenu} anchorEl={langSubmenu} placement="right-start" sx={{ zIndex: theme.zIndex.modal + 1 }}>
          <Paper
            elevation={8}
            sx={{ minWidth: 140 }}
            onMouseEnter={() => cancelSubmenuClose(langTimeout)}
            onMouseLeave={() => closeSubmenuDelayed(setLangSubmenu, langTimeout)}
          >
            <MenuList dense>
              {languages.map((lang) => (
                <MenuItem
                  key={lang.code}
                  onClick={() => {
                    i18n.changeLanguage(lang.code);
                    localStorage.setItem("openreq-lang", lang.code);
                    closeAll();
                  }}
                  sx={menuItemSx}
                >
                  <ListItemText>{lang.label}</ListItemText>
                  {i18n.language === lang.code && (
                    <Check sx={{ fontSize: 14, ml: 1, color: "primary.main" }} />
                  )}
                </MenuItem>
              ))}
            </MenuList>
          </Paper>
        </Popper>
        <Divider />
        <MenuItem onClick={() => act(props.onAbout)}>
          <ListItemIcon><Info sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText>{t("menu.about")}</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  );
}
