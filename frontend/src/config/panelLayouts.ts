import type { PanelLayout, PanelLayoutItem, PanelId } from "@/types";

// ── Grid Configuration ──
export const GRID_COLS = 36;
export const GRID_ROW_HEIGHT = 10;
export const GRID_MARGIN: [number, number] = [4, 4];
export const GRID_CONTAINER_PADDING: [number, number] = [4, 4];

// ── Per-Panel Constraints ──
export const PANEL_CONSTRAINTS: Record<
  PanelId,
  { minW: number; minH: number; maxW: number; maxH: number }
> = {
  requestBuilder: { minW: 6, minH: 6, maxW: 36, maxH: 150 },
  scriptEditor: { minW: 6, minH: 4, maxW: 36, maxH: 150 },
  responsePanel: { minW: 6, minH: 6, maxW: 36, maxH: 150 },
};

function applyConstraints(items: PanelLayoutItem[]): PanelLayoutItem[] {
  return items.map((item) => {
    const c = PANEL_CONSTRAINTS[item.i];
    return c ? { ...item, ...c } : item;
  });
}

// ── Layout Presets ──

export const LAYOUT_DEFAULT: PanelLayout = {
  id: "default",
  nameKey: "layout.presetDefault",
  items: applyConstraints([
    { i: "requestBuilder", x: 0, y: 0, w: 36, h: 42 },
    { i: "scriptEditor", x: 0, y: 42, w: 36, h: 15 },
    { i: "responsePanel", x: 0, y: 57, w: 36, h: 45 },
  ]),
};

export const LAYOUT_SIDE_BY_SIDE: PanelLayout = {
  id: "sideBySide",
  nameKey: "layout.presetSideBySide",
  items: applyConstraints([
    { i: "requestBuilder", x: 0, y: 0, w: 18, h: 48 },
    { i: "responsePanel", x: 18, y: 0, w: 18, h: 48 },
    { i: "scriptEditor", x: 0, y: 48, w: 36, h: 24 },
  ]),
};

export const LAYOUT_WIDE_RESPONSE: PanelLayout = {
  id: "wideResponse",
  nameKey: "layout.presetWideResponse",
  items: applyConstraints([
    { i: "requestBuilder", x: 0, y: 0, w: 36, h: 30 },
    { i: "scriptEditor", x: 0, y: 30, w: 36, h: 18 },
    { i: "responsePanel", x: 0, y: 48, w: 36, h: 60 },
  ]),
};

export const LAYOUT_COMPACT: PanelLayout = {
  id: "compact",
  nameKey: "layout.presetCompact",
  items: applyConstraints([
    { i: "requestBuilder", x: 0, y: 0, w: 24, h: 36 },
    { i: "scriptEditor", x: 24, y: 0, w: 12, h: 36 },
    { i: "responsePanel", x: 0, y: 36, w: 36, h: 36 },
  ]),
};

export const LAYOUT_PRESETS: PanelLayout[] = [
  LAYOUT_DEFAULT,
  LAYOUT_SIDE_BY_SIDE,
  LAYOUT_WIDE_RESPONSE,
  LAYOUT_COMPACT,
];

// ── Custom Presets ──
export const CUSTOM_PRESETS_STORAGE_KEY = "openreq-custom-presets";
export const MAX_CUSTOM_PRESETS = 5;

export const PANEL_META: Record<PanelId, { titleKey: string; icon: string }> = {
  requestBuilder: { titleKey: "layout.panelRequest", icon: "Send" },
  scriptEditor: { titleKey: "layout.panelScripts", icon: "Terminal" },
  responsePanel: { titleKey: "layout.panelResponse", icon: "Receipt" },
};
