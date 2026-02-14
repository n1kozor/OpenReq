import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";
import { Box } from "@mui/material";
import { Send, Terminal, Receipt, Cable } from "@mui/icons-material";
import DraggablePanel from "./DraggablePanel";
import LayoutToolbar from "./LayoutToolbar";
import {
  GRID_COLS,
  GRID_ROW_HEIGHT,
  GRID_MARGIN,
  GRID_CONTAINER_PADDING,
  LAYOUT_PRESETS,
  LAYOUT_DEFAULT,
  PANEL_META,
} from "@/config/panelLayouts";
import type { PanelId, PanelLayoutItem, PersistedLayoutState } from "@/types";

const LAYOUT_STORAGE_KEY = "openreq-panel-layout";
const LAYOUT_VERSION = 1;

const PANEL_ICONS: Record<string, React.ReactNode> = {
  Send: <Send sx={{ fontSize: 14 }} />,
  Terminal: <Terminal sx={{ fontSize: 14 }} />,
  Receipt: <Receipt sx={{ fontSize: 14 }} />,
  Cable: <Cable sx={{ fontSize: 14 }} />,
};

interface PanelGridLayoutProps {
  showWebSocket: boolean;
  children: {
    requestBuilder: React.ReactNode;
    scriptEditor: React.ReactNode;
    responsePanel: React.ReactNode;
    webSocketPanel: React.ReactNode;
  };
}

function loadPersistedLayout(): PersistedLayoutState | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedLayoutState;
    if (parsed.version !== LAYOUT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistLayout(state: PersistedLayoutState): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function toRglLayout(items: PanelLayoutItem[], minimizedPanels: PanelId[], visiblePanels: PanelId[]): Layout {
  return items
    .filter((item) => visiblePanels.includes(item.i))
    .map((item) => ({
      ...item,
      h: minimizedPanels.includes(item.i) ? 2 : item.h,
      isResizable: !minimizedPanels.includes(item.i),
    }));
}

export default function PanelGridLayout({
  showWebSocket,
  children,
}: PanelGridLayoutProps) {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 });

  const [layoutState, setLayoutState] = useState<PersistedLayoutState>(() => {
    const persisted = loadPersistedLayout();
    if (persisted) return persisted;
    return {
      version: LAYOUT_VERSION,
      activePresetId: "default",
      items: LAYOUT_DEFAULT.items,
      minimizedPanels: [],
    };
  });

  // One-time cleanup of old key
  useEffect(() => {
    localStorage.removeItem("openreq-response-panel-height");
  }, []);

  useEffect(() => {
    persistLayout(layoutState);
  }, [layoutState]);

  const visiblePanelIds: PanelId[] = useMemo(() => {
    const ids: PanelId[] = ["requestBuilder", "scriptEditor", "responsePanel"];
    if (showWebSocket) ids.push("webSocketPanel");
    return ids;
  }, [showWebSocket]);

  const rglLayout = useMemo(
    () => toRglLayout(layoutState.items, layoutState.minimizedPanels, visiblePanelIds),
    [layoutState, visiblePanelIds],
  );

  const handleLayoutChange = useCallback((newLayout: Layout) => {
    setLayoutState((prev) => {
      const updatedItems = prev.items.map((item) => {
        const rglItem = (newLayout as readonly LayoutItem[]).find((l) => l.i === item.i);
        if (!rglItem) return item;
        return {
          ...item,
          x: rglItem.x,
          y: rglItem.y,
          w: rglItem.w,
          h: prev.minimizedPanels.includes(item.i as PanelId) ? item.h : rglItem.h,
        };
      });
      return {
        ...prev,
        items: updatedItems,
        activePresetId: "custom",
      };
    });
  }, []);

  const handleSelectPreset = useCallback((presetId: string) => {
    const preset = LAYOUT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setLayoutState({
      version: LAYOUT_VERSION,
      activePresetId: presetId,
      items: preset.items,
      minimizedPanels: [],
    });
  }, []);

  const handleResetLayout = useCallback(() => {
    setLayoutState({
      version: LAYOUT_VERSION,
      activePresetId: "default",
      items: LAYOUT_DEFAULT.items,
      minimizedPanels: [],
    });
  }, []);

  const handleToggleMinimize = useCallback((panelId: PanelId) => {
    setLayoutState((prev) => {
      const isMinimized = prev.minimizedPanels.includes(panelId);
      return {
        ...prev,
        minimizedPanels: isMinimized
          ? prev.minimizedPanels.filter((id) => id !== panelId)
          : [...prev.minimizedPanels, panelId],
      };
    });
  }, []);

  const panelContent: Record<PanelId, React.ReactNode> = {
    requestBuilder: children.requestBuilder,
    scriptEditor: children.scriptEditor,
    responsePanel: children.responsePanel,
    webSocketPanel: children.webSocketPanel,
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <LayoutToolbar
        presets={LAYOUT_PRESETS}
        activePresetId={layoutState.activePresetId}
        onSelectPreset={handleSelectPreset}
        onResetLayout={handleResetLayout}
      />

      <Box ref={containerRef} sx={{ flex: 1, overflow: "auto", position: "relative" }}>
        {mounted && (
          <ResponsiveGridLayout
            className="openreq-grid-layout"
            width={width}
            layouts={{ lg: rglLayout }}
            breakpoints={{ lg: 0 }}
            cols={{ lg: GRID_COLS }}
            rowHeight={GRID_ROW_HEIGHT}
            margin={GRID_MARGIN}
            containerPadding={GRID_CONTAINER_PADDING}
            dragConfig={{ handle: ".panel-drag-handle" }}
            onLayoutChange={handleLayoutChange}
            compactor={verticalCompactor}
          >
            {visiblePanelIds.map((panelId) => {
              const meta = PANEL_META[panelId];
              return (
                <div key={panelId} style={{ height: "100%" }}>
                  <DraggablePanel
                    titleKey={meta.titleKey}
                    icon={PANEL_ICONS[meta.icon]}
                    isMinimized={layoutState.minimizedPanels.includes(panelId)}
                    onToggleMinimize={() => handleToggleMinimize(panelId)}
                  >
                    {panelContent[panelId]}
                  </DraggablePanel>
                </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </Box>
    </Box>
  );
}
