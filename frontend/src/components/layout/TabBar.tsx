import { useState } from "react";
import { Tabs, Tab, Box, IconButton, Menu, MenuItem } from "@mui/material";
import { Close, Add, ContentCopy, Delete, FolderOpen } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import type { RequestTab } from "@/types";

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
  onNewTab: () => void;
  onDuplicateTab?: (id: string) => void;
  onCloseOtherTabs?: (id: string) => void;
  onCloseAllTabs?: () => void;
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
}: TabBarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
  const [contextMenu, setContextMenu] = useState<{
    position: { top: number; left: number };
    tabId: string;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ position: { top: e.clientY, left: e.clientX }, tabId });
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        borderBottom: `1px solid ${alpha(
          isDark ? "#8b949e" : "#64748b",
          0.1
        )}`,
        minHeight: 40,
        backgroundColor: isDark
          ? alpha("#0d1117", 0.5)
          : alpha("#f1f5f9", 0.5),
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
          minHeight: 40,
          "& .MuiTabs-indicator": {
            height: 2,
            borderRadius: "2px 2px 0 0",
          },
        }}
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            sx={{
              minHeight: 40,
              px: 1.5,
              py: 0,
              transition: "all 0.15s ease",
            }}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
            label={
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                }}
              >
                {tab.tabType === "collection" ? (
                  /* Collection tab icon */
                  <FolderOpen
                    sx={{
                      fontSize: 14,
                      color: theme.palette.primary.main,
                      flexShrink: 0,
                    }}
                  />
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
            }
          />
        ))}
      </Tabs>
      <IconButton
        size="small"
        onClick={onNewTab}
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

      {/* Spacer — pushes remaining space to the right */}
      <Box sx={{ flexGrow: 1 }} />

      {/* Tab context menu */}
      <Menu
        anchorReference="anchorPosition"
        anchorPosition={contextMenu?.position}
        open={!!contextMenu}
        onClose={() => setContextMenu(null)}
      >
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
