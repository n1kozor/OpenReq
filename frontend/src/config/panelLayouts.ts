import type { PanelLayout, PanelLayoutItem, PanelId } from "@/types";

// ── Grid Configuration ──
export const GRID_COLS = 12;
export const GRID_ROW_HEIGHT = 30;
export const GRID_MARGIN: [number, number] = [12, 12];
export const GRID_CONTAINER_PADDING: [number, number] = [16, 12];

// ── Per-Panel Constraints ──
export const PANEL_CONSTRAINTS: Record<
  PanelId,
  { minW: number; minH: number; maxW: number; maxH: number }
> = {
  requestBuilder: { minW: 4, minH: 8, maxW: 12, maxH: 30 },
  scriptEditor: { minW: 4, minH: 4, maxW: 12, maxH: 20 },
  responsePanel: { minW: 4, minH: 6, maxW: 12, maxH: 40 },
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
    { i: "requestBuilder", x: 0, y: 0, w: 12, h: 14 },
    { i: "scriptEditor", x: 0, y: 14, w: 12, h: 5 },
    { i: "responsePanel", x: 0, y: 19, w: 12, h: 15 },
  ]),
};

export const LAYOUT_SIDE_BY_SIDE: PanelLayout = {
  id: "sideBySide",
  nameKey: "layout.presetSideBySide",
  items: applyConstraints([
    { i: "requestBuilder", x: 0, y: 0, w: 6, h: 16 },
    { i: "responsePanel", x: 6, y: 0, w: 6, h: 16 },
    { i: "scriptEditor", x: 0, y: 16, w: 12, h: 8 },
  ]),
};

export const LAYOUT_WIDE_RESPONSE: PanelLayout = {
  id: "wideResponse",
  nameKey: "layout.presetWideResponse",
  items: applyConstraints([
    { i: "requestBuilder", x: 0, y: 0, w: 12, h: 10 },
    { i: "scriptEditor", x: 0, y: 10, w: 12, h: 6 },
    { i: "responsePanel", x: 0, y: 16, w: 12, h: 20 },
  ]),
};

export const LAYOUT_COMPACT: PanelLayout = {
  id: "compact",
  nameKey: "layout.presetCompact",
  items: applyConstraints([
    { i: "requestBuilder", x: 0, y: 0, w: 8, h: 12 },
    { i: "scriptEditor", x: 8, y: 0, w: 4, h: 12 },
    { i: "responsePanel", x: 0, y: 12, w: 12, h: 12 },
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
