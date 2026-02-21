import { useState, useRef, useEffect } from "react";
import { Tabs, Tab, Box, IconButton, Menu, MenuItem, TextField } from "@mui/material";
import { Close, Add, ContentCopy, Delete, FolderOpen, AccountTree, Cable, Hub, Http, Edit } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import type { RequestTab, Protocol } from "@/types";

const METHOD_COLORS: Record<string, string> = {
  GET: "#34d399",
  POST: "#fbbf24",
  PUT: "#818cf8",
  PATCH: "#f472b6",
  DELETE: "#f87171",
  HEAD: "#38bdf8",
  OPTIONS: "#a78bfa",
};

interface TabBarProps {
  tabs: RequestTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: (protocol?: Protocol) => void;
  onDuplicateTab?: (id: string) => void;
  onCloseOtherTabs?: (id: string) => void;
  onCloseAllTabs?: () => void;
  onRenameTab?: (id: string, name: string) => void;
  onCloneRequest?: (id: string) => void;
}

export default function TabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onDuplicateTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  onRenameTab,
  onCloneRequest,
}: TabBarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
  const [contextMenu, setContextMenu] = useState<{
    position: { top: number; left: number };
    tabId: string;
  } | null>(null);
  const [newTabMenuAnchor, setNewTabMenuAnchor] = useState<HTMLElement | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingTabId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingTabId]);

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ position: { top: e.clientY, left: e.clientX }, tabId });
  };

  const startRename = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    setRenamingTabId(tabId);
    setRenameValue(tab.name || "");
  };

  const commitRename = () => {
    if (renamingTabId && onRenameTab && renameValue.trim()) {
      onRenameTab(renamingTabId, renameValue.trim());
    }
    setRenamingTabId(null);
    setRenameValue("");
  };

  const contextTab = contextMenu ? tabs.find((t) => t.id === contextMenu.tabId) : null;
  const isRequestTab = contextTab && contextTab.tabType !== "collection" && contextTab.tabType !== "testflow" && contextTab.tabType !== "folder";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        borderBottom: `1px solid ${isDark ? "#4e5157" : "#d1d1d1"}`,
        minHeight: 34,
        backgroundColor: isDark ? "#1e1f22" : "#e8e8e8",
      }}
    >
      <Tabs
        value={activeIndex >= 0 ? activeIndex : false}
        onChange={(_, idx) => {
          const tab = tabs[idx];
          if (tab) onSelectTab(tab.id);
        }}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          minHeight: 34,
          "& .MuiTabs-indicator": {
            height: 2,
            borderRadius: 0,
          },
        }}
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            sx={{
              minHeight: 34,
              px: 1.5,
              py: 0,
              borderRadius: 0,
              transition: "all 0.1s ease",
              "&.Mui-selected": {
                backgroundColor: isDark ? "#2b2d30" : "#ffffff",
              },
            }}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
            label={
              renamingTabId === tab.id ? (
                <TextField
                  inputRef={renameInputRef}
                  size="small"
                  variant="standard"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") {
                      setRenamingTabId(null);
                      setRenameValue("");
                    }
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  sx={{
                    width: 130,
                    "& .MuiInput-input": {
                      fontSize: "0.78rem",
                      fontWeight: 500,
                      py: 0.25,
                    },
                  }}
                />
              ) : (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                  }}
                >
                  {tab.tabType === "testflow" ? (
                    <AccountTree
                      sx={{
                        fontSize: 14,
                        color: theme.palette.secondary.main,
                        flexShrink: 0,
                      }}
                    />
                  ) : tab.tabType === "collection" ? (
                    <FolderOpen
                      sx={{
                        fontSize: 14,
                        color: theme.palette.primary.main,
                        flexShrink: 0,
                      }}
                    />
                  ) : tab.tabType === "folder" ? (
                    <FolderOpen
                      sx={{
                        fontSize: 14,
                        color: theme.palette.warning.main,
                        flexShrink: 0,
                      }}
                    />
                  ) : tab.protocol === "websocket" ? (
                    <>
                      <Cable sx={{ fontSize: 14, color: "#14b8a6", flexShrink: 0 }} />
                      <Box component="span" sx={{ fontSize: "0.6rem", fontWeight: 700, color: "#14b8a6", letterSpacing: "0.03em", lineHeight: 1, minWidth: 20 }}>
                        WS
                      </Box>
                    </>
                  ) : tab.protocol === "graphql" ? (
                    <>
                      <Hub sx={{ fontSize: 14, color: "#e879f9", flexShrink: 0 }} />
                      <Box component="span" sx={{ fontSize: "0.6rem", fontWeight: 700, color: "#e879f9", letterSpacing: "0.03em", lineHeight: 1, minWidth: 24 }}>
                        GQL
                      </Box>
                    </>
                  ) : (
                    <>
                      {/* Method dot */}
                      <Box
                        sx={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          bgcolor: METHOD_COLORS[tab.method] ?? "#888",
                          flexShrink: 0,
                          boxShadow: `0 0 4px ${
                            METHOD_COLORS[tab.method] ?? "#888"
                          }50`,
                        }}
                      />
                      {/* Method label */}
                      <Box
                        component="span"
                        sx={{
                          fontSize: "0.6rem",
                          fontWeight: 700,
                          color: METHOD_COLORS[tab.method] ?? "#888",
                          letterSpacing: "0.03em",
                          lineHeight: 1,
                          minWidth: 28,
                        }}
                      >
                        {tab.method}
                      </Box>
                    </>
                  )}
                  {/* Name */}
                  <Box
                    component="span"
                    sx={{
                      fontSize: "0.78rem",
                      fontWeight: 500,
                      maxWidth: 140,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab.name || t("request.newRequest")}
                  </Box>
                  {/* Dirty indicator */}
                  {tab.isDirty && (
                    <Box
                      sx={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        bgcolor: theme.palette.warning.main,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {/* Close button */}
                  <Box
                    component="span"
                    role="button"
                    sx={{
                      ml: 0.25,
                      p: 0.25,
                      borderRadius: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      cursor: "pointer",
                      opacity: 0,
                      transition: "all 0.15s ease",
                      ".MuiTab-root:hover &": { opacity: 0.6 },
                      "&:hover": {
                        opacity: "1 !important",
                        bgcolor: alpha(theme.palette.error.main, 0.12),
                        color: theme.palette.error.main,
                      },
                    }}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                  >
                    <Close sx={{ fontSize: 13 }} />
                  </Box>
                </Box>
              )
            }
          />
        ))}
      </Tabs>
      <IconButton
        size="small"
        onClick={(e) => setNewTabMenuAnchor(e.currentTarget)}
        sx={{
          mx: 0.5,
          width: 28,
          height: 28,
          flexShrink: 0,
          borderRadius: 1.5,
          color: "text.secondary",
          transition: "all 0.15s ease",
          "&:hover": {
            color: "primary.main",
            backgroundColor: alpha(theme.palette.primary.main, 0.08),
          },
        }}
      >
        <Add sx={{ fontSize: 16 }} />
      </IconButton>

      {/* New tab type menu */}
      <Menu
        anchorEl={newTabMenuAnchor}
        open={!!newTabMenuAnchor}
        onClose={() => setNewTabMenuAnchor(null)}
      >
        <MenuItem onClick={() => { onNewTab("http"); setNewTabMenuAnchor(null); }}>
          <Http sx={{ mr: 1.5, fontSize: 16, color: "#34d399" }} />
          {t("layout.newHttp")}
        </MenuItem>
        <MenuItem onClick={() => { onNewTab("websocket"); setNewTabMenuAnchor(null); }}>
          <Cable sx={{ mr: 1.5, fontSize: 16, color: "#14b8a6" }} />
          {t("layout.newWebSocket")}
        </MenuItem>
        <MenuItem onClick={() => { onNewTab("graphql"); setNewTabMenuAnchor(null); }}>
          <Hub sx={{ mr: 1.5, fontSize: 16, color: "#e879f9" }} />
          {t("layout.newGraphQL")}
        </MenuItem>
      </Menu>

      {/* Spacer — pushes remaining space to the right */}
      <Box sx={{ flexGrow: 1 }} />

      {/* Tab context menu */}
      <Menu
        anchorReference="anchorPosition"
        anchorPosition={contextMenu?.position}
        open={!!contextMenu}
        onClose={() => setContextMenu(null)}
      >
        {isRequestTab && onRenameTab && (
          <MenuItem
            onClick={() => {
              if (contextMenu) startRename(contextMenu.tabId);
              setContextMenu(null);
            }}
          >
            <Edit sx={{ mr: 1.5, fontSize: 16 }} /> {t("common.rename")}
          </MenuItem>
        )}
        {onDuplicateTab && (
          <MenuItem
            onClick={() => {
              if (contextMenu) {
                onDuplicateTab(contextMenu.tabId);
              }
              setContextMenu(null);
            }}
          >
            <ContentCopy sx={{ mr: 1.5, fontSize: 16 }} />{" "}
            {t("common.duplicate")}
          </MenuItem>
        )}
        {isRequestTab && onCloneRequest && contextTab?.savedRequestId && (
          <MenuItem
            onClick={() => {
              if (contextMenu) {
                onCloneRequest(contextMenu.tabId);
              }
              setContextMenu(null);
            }}
          >
            <ContentCopy sx={{ mr: 1.5, fontSize: 16, color: theme.palette.info.main }} />{" "}
            {t("common.cloneRequest")}
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            if (contextMenu) {
              onCloseTab(contextMenu.tabId);
            }
            setContextMenu(null);
          }}
        >
          <Close sx={{ mr: 1.5, fontSize: 16 }} /> {t("common.close")}
        </MenuItem>
        {onCloseOtherTabs && tabs.length > 1 && (
          <MenuItem
            onClick={() => {
              if (contextMenu) {
                onCloseOtherTabs(contextMenu.tabId);
              }
              setContextMenu(null);
            }}
          >
            <Delete sx={{ mr: 1.5, fontSize: 16 }} /> {t("common.closeOthers")}
          </MenuItem>
        )}
        {onCloseAllTabs && tabs.length > 1 && (
          <MenuItem
            onClick={() => {
              onCloseAllTabs();
              setContextMenu(null);
            }}
          >
            <Delete sx={{ mr: 1.5, fontSize: 16 }} color="error" /> {t("common.closeAll")}
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}
