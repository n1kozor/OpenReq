import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Drawer,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  IconButton,
  TextField,
  Divider,
  Menu,
  MenuItem as MuiMenuItem,
  ListItemSecondaryAction,
  InputAdornment,
} from "@mui/material";
import {
  Add,
  ExpandMore,
  ChevronRight,
  MoreVert,
  CreateNewFolder,
  NoteAdd,
  Edit,
  Delete,
  PlayArrow,
  AutoAwesome,
  FileDownload,
  Search,
  SwapHoriz,
  ContentCopy,
  Lock,
  Refresh,
  IosShare,
  Settings,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import type { Collection, CollectionItem } from "@/types";

const DRAWER_WIDTH = 264;
const MIN_DRAWER_WIDTH = 220;
const MAX_DRAWER_WIDTH = 420;
const SIDEBAR_WIDTH_STORAGE_KEY = "openreq-sidebar-width";
const COLLECTION_ROW_HEIGHT = 32;
const ITEM_ROW_HEIGHT = 30;

const METHOD_COLORS: Record<string, string> = {
  GET: "#22c55e",
  POST: "#eab308",
  PUT: "#3b82f6",
  PATCH: "#a855f7",
  DELETE: "#ef4444",
  HEAD: "#06b6d4",
  OPTIONS: "#f97316",
};

interface SidebarProps {
  collections: Collection[];
  collectionItems: Record<string, CollectionItem[]>;
  collectionTrees: Record<string, CollectionItem[]>;
  collectionTreeLoading: Record<string, boolean>;
  onSelectRequest: (requestId: string, collectionId: string, collectionItemId?: string) => void;
  onOpenCollection: (collectionId: string) => void;
  onNewCollection: () => void;
  onNewFolder: (collectionId: string, parentId?: string) => void;
  onOpenFolder: (folderId: string, collectionId: string) => void;
  onNewRequest: (collectionId: string, folderId?: string) => void;
  onEditCollection: (collectionId: string, name: string, description: string, visibility: "private" | "shared", variables: Record<string, string> | null) => void;
  onRenameCollection: (collectionId: string, currentName: string) => void;
  onDeleteCollection: (collectionId: string, name: string) => void;
  onRenameItem: (itemId: string, currentName: string) => void;
  onDeleteItem: (itemId: string, name: string) => void;
  onRunCollection: (collectionId: string) => void;
  onOpenAIWizard: () => void;
  onOpenImport: () => void;
  onExportCollection: (collectionId: string) => void;
  onDuplicateCollection: (collectionId: string, currentName: string) => void;
  onExportFolder: (folderId: string, name: string) => void;
  onExportRequest: (requestId: string, name: string) => void;
  onCloneItem: (itemId: string, requestId: string, name: string) => void;
  onRequestCollectionTree: (collectionId: string) => void;
  onRequestAllCollectionItems: () => void;
  onMoveItem: (collectionId: string, itemId: string, parentId: string | null) => void;
  onReorderItem: (collectionId: string, itemId: string, targetItemId: string) => void;
  onReorderCollection: (draggedId: string, targetId: string) => void;
  onGenerateDocs: (collectionId: string, collectionName: string, folderId?: string, folderName?: string) => void;
  onShareDocs: (collectionId: string, collectionName: string, folderId?: string | null, folderName?: string | null) => void;
  onRefreshCollections: () => void;
  onDirectRenameItem?: (itemId: string, newName: string) => void;
}

type SidebarRow =
  | { type: "collection"; collection: Collection; forceOpen: boolean }
  | { type: "item"; item: CollectionItem; depth: number; forceOpen: boolean; collectionId: string }
  | { type: "loading"; collectionId: string; depth: number };

/** Drag payload stored in a ref */
interface DragInfo {
  kind: "collection" | "item";
  id: string;
  collectionId: string | null;
  rowIndex: number;
}

export default function Sidebar({
  collections,
  collectionItems,
  collectionTrees,
  collectionTreeLoading,
  onSelectRequest,
  onOpenCollection,
  onNewCollection,
  onNewFolder,
  onOpenFolder,
  onNewRequest,
  onEditCollection,
  onRenameCollection,
  onDeleteCollection,
  onRenameItem,
  onDeleteItem,
  onRunCollection,
  onOpenAIWizard,
  onOpenImport,
  onDuplicateCollection,
  onExportCollection,
  onExportFolder,
  onExportRequest,
  onCloneItem,
  onRequestCollectionTree,
  onRequestAllCollectionItems,
  onMoveItem,
  onReorderItem,
  onReorderCollection,
  onGenerateDocs,
  onShareDocs,
  onRefreshCollections,
  onDirectRenameItem,
}: SidebarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [search, setSearch] = useState("");
  const [drawerWidth, setDrawerWidth] = useState(() => {
    const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    if (!Number.isNaN(saved) && saved > 0) {
      return Math.min(MAX_DRAWER_WIDTH, Math.max(MIN_DRAWER_WIDTH, saved));
    }
    return DRAWER_WIDTH;
  });
  const [collectionOpen, setCollectionOpen] = useState<Record<string, boolean>>({});
  const [folderOpen, setFolderOpen] = useState<Record<string, boolean>>({});
  const [colMenuPos, setColMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [colMenuTarget, setColMenuTarget] = useState<Collection | null>(null);
  const [itemMenuPos, setItemMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [itemMenuTarget, setItemMenuTarget] = useState<CollectionItem | null>(null);
  const [itemMenuCollectionId, setItemMenuCollectionId] = useState<string | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState("");

  /* ── Drag state ── */
  const dragRef = useRef<DragInfo | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ rowIndex: number; position: "before" | "after" | "inside" } | null>(null);

  // Cleanup on drag end anywhere
  useEffect(() => {
    const cleanup = () => {
      dragRef.current = null;
      setDraggingId(null);
      setDropIndicator(null);
    };
    document.addEventListener("dragend", cleanup);
    return () => document.removeEventListener("dragend", cleanup);
  }, []);

  const handleColMenu = (e: React.MouseEvent, col: Collection) => {
    e.preventDefault();
    e.stopPropagation();
    setColMenuPos({ top: e.clientY, left: e.clientX });
    setColMenuTarget(col);
  };

  const handleColMenuFromButton = (e: React.MouseEvent, col: Collection) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setColMenuPos({ top: rect.bottom, left: rect.left });
    setColMenuTarget(col);
  };

  const handleItemContext = (e: React.MouseEvent, item: CollectionItem, collectionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setItemMenuPos({ top: e.clientY, left: e.clientX });
    setItemMenuTarget(item);
    setItemMenuCollectionId(collectionId);
  };

  const handleItemMenuFromButton = (e: React.MouseEvent, item: CollectionItem, collectionId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setItemMenuPos({ top: rect.bottom, left: rect.left });
    setItemMenuTarget(item);
    setItemMenuCollectionId(collectionId);
  };

  const searchTerm = search.trim().toLowerCase();

  useEffect(() => {
    if (searchTerm) onRequestAllCollectionItems();
  }, [searchTerm, onRequestAllCollectionItems]);

  const collectionViews = useMemo(() => {
    const matchText = (value: string) => value.toLowerCase().includes(searchTerm);
    const filterTree = (nodes: CollectionItem[]): CollectionItem[] => {
      const filtered: CollectionItem[] = [];
      for (const node of nodes) {
        const children = node.children ? filterTree(node.children) : [];
        if (node.is_folder) {
          if (matchText(node.name) || children.length > 0) {
            filtered.push({ ...node, children });
          }
        } else if (matchText(node.name)) {
          filtered.push({ ...node, children: [] });
        }
      }
      return filtered;
    };

    return collections.map((c) => {
      const tree = collectionTrees[c.id] ?? [];
      if (!searchTerm) {
        return { collection: c, tree, visible: true, forceOpen: false };
      }
      const collectionMatch = matchText(c.name);
      const filteredTree = collectionMatch ? tree : filterTree(tree);
      return {
        collection: c,
        tree: filteredTree,
        visible: collectionMatch || filteredTree.length > 0,
        forceOpen: collectionMatch || filteredTree.length > 0,
      };
    });
  }, [collections, collectionTrees, searchTerm]);


  const baseRows = useMemo(() => {
    const rows: SidebarRow[] = [];
    const isOpenCollection = (id: string, forceOpen: boolean) =>
      forceOpen || collectionOpen[id] === true;
    const isOpenFolder = (id: string, forceOpen: boolean) =>
      forceOpen || folderOpen[id] === true;

    const walk = (nodes: CollectionItem[], depth: number, forceOpen: boolean, colId: string) => {
      for (const node of nodes) {
        rows.push({ type: "item", item: node, depth, forceOpen, collectionId: colId });
        if (node.is_folder) {
          const open = isOpenFolder(node.id, forceOpen);
          if (open && node.children?.length) {
            walk(node.children, depth + 1, forceOpen, colId);
          }
        }
      }
    };

    for (const view of collectionViews.filter((c) => c.visible)) {
      const colId = view.collection.id;
      const isOpen = isOpenCollection(colId, view.forceOpen);
      rows.push({ type: "collection", collection: view.collection, forceOpen: view.forceOpen });
      if (isOpen) {
        if (!collectionTrees[colId] && collectionTreeLoading[colId]) {
          rows.push({ type: "loading", collectionId: colId, depth: 1 });
        } else {
          walk(view.tree, 1, view.forceOpen, colId);
        }
      }
    }
    return rows;
  }, [collectionViews, collectionOpen, folderOpen, collectionTrees, collectionTreeLoading]);

  // Drop indicator line component
  const DropLine = ({ position }: { position: "before" | "after" }) => (
    <Box
      sx={{
        position: "absolute",
        left: 8,
        right: 8,
        height: 2,
        borderRadius: 1,
        backgroundColor: theme.palette.primary.main,
        boxShadow: `0 0 6px ${alpha(theme.palette.primary.main, 0.5)}`,
        zIndex: 10,
        pointerEvents: "none",
        ...(position === "before" ? { top: -1 } : { bottom: -1 }),
      }}
    />
  );

  /* ── Drag handlers ── */
  const startDrag = useCallback((e: React.DragEvent, info: DragInfo) => {
    dragRef.current = info;
    e.dataTransfer.effectAllowed = "copyMove";
    // Set MIME data so TestFlow canvas (and other drop targets) can read it
    if (info.kind === "collection") {
      e.dataTransfer.setData("application/openreq-collection", JSON.stringify({ collectionId: info.id }));
    } else {
      e.dataTransfer.setData("application/openreq-item", JSON.stringify({ itemId: info.id, collectionId: info.collectionId }));
    }
    requestAnimationFrame(() => setDraggingId(info.id));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, rowIndex: number) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const row = baseRows[rowIndex];
    if (!row) return;

    // Don't allow drop on yourself
    const dragId = dragRef.current.id;
    if (row.type === "collection" && row.collection.id === dragId) {
      setDropIndicator(null);
      return;
    }
    if (row.type === "item" && row.item.id === dragId) {
      setDropIndicator(null);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    // For folders: top third = before, middle third = inside, bottom third = after
    if (row.type === "item" && row.item.is_folder) {
      if (y < height * 0.3) {
        setDropIndicator({ rowIndex, position: "before" });
      } else if (y > height * 0.7) {
        setDropIndicator({ rowIndex, position: "after" });
      } else {
        setDropIndicator({ rowIndex, position: "inside" });
      }
    } else {
      // For non-folders and collections: top half = before, bottom half = after
      setDropIndicator({ rowIndex, position: y < height / 2 ? "before" : "after" });
    }
  }, [baseRows]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const drag = dragRef.current;
    const indicator = dropIndicator;

    // Reset state
    dragRef.current = null;
    setDraggingId(null);
    setDropIndicator(null);

    if (!drag || !indicator) return;

    const targetRow = baseRows[indicator.rowIndex];
    if (!targetRow) return;

    if (drag.kind === "collection") {
      // Collection reorder: find the target collection
      if (targetRow.type === "collection") {
        onReorderCollection(drag.id, targetRow.collection.id);
      }
    } else if (drag.kind === "item" && drag.collectionId) {
      if (indicator.position === "inside" && targetRow.type === "item" && targetRow.item.is_folder) {
        // Drop into folder
        onMoveItem(drag.collectionId, drag.id, targetRow.item.id);
      } else if (targetRow.type === "collection") {
        // Drop onto collection header = move to root
        onMoveItem(drag.collectionId, drag.id, null);
      } else if (targetRow.type === "item") {
        // Reorder relative to target item
        onReorderItem(drag.collectionId, drag.id, targetRow.item.id);
      }
    }
  }, [baseRows, dropIndicator, onReorderCollection, onReorderItem, onMoveItem]);

  const handleDragEnd = useCallback(() => {
    dragRef.current = null;
    setDraggingId(null);
    setDropIndicator(null);
  }, []);

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: drawerWidth,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
          boxSizing: "border-box",
          borderRight: `1px solid ${isDark ? "#4e5157" : "#d1d1d1"}`,
          background: isDark ? "#2b2d30" : "#f0f0f0",
        },
      }}
    >
      {/* Search */}
      <Box sx={{ px: 1, py: 0.75 }}>
        <TextField
          fullWidth
          size="small"
          placeholder={t("common.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 14, color: "text.secondary", opacity: 0.6 }} />
              </InputAdornment>
            ),
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              height: 28,
              fontSize: "0.78rem",
              borderRadius: 1,
              backgroundColor: isDark ? "#1e1f22" : "#ffffff",
            },
          }}
        />
      </Box>

      {/* Collections header */}
      <Box
        sx={{
          px: 1,
          py: 0.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "text.secondary",
            fontSize: "0.65rem",
          }}
        >
          {t("nav.collections")}
        </Typography>
        <Box sx={{ display: "flex", gap: 0 }}>
          <IconButton
            size="small"
            onClick={onOpenImport}
            title={t("importExport.title")}
            sx={{
              width: 24,
              height: 24,
              borderRadius: 1.5,
              color: "text.secondary",
              "&:hover": { color: "primary.main" },
            }}
          >
            <SwapHoriz sx={{ fontSize: 14 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={onRefreshCollections}
            title={t("common.refresh")}
            sx={{
              width: 24,
              height: 24,
              borderRadius: 1.5,
              color: "text.secondary",
              "&:hover": { color: "primary.main" },
            }}
          >
            <Refresh sx={{ fontSize: 14 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={onOpenAIWizard}
            title={t("ai.wizardTitle")}
            sx={{
              width: 24,
              height: 24,
              borderRadius: 1.5,
              color: theme.palette.warning.main,
              "&:hover": {
                backgroundColor: alpha(theme.palette.warning.main, 0.1),
              },
            }}
          >
            <AutoAwesome sx={{ fontSize: 14 }} />
          </IconButton>
          <IconButton
            size="small"
            onClick={onNewCollection}
            sx={{
              width: 24,
              height: 24,
              borderRadius: 1.5,
              color: "text.secondary",
              "&:hover": { color: "primary.main" },
            }}
          >
            <Add sx={{ fontSize: 15 }} />
          </IconButton>
        </Box>
      </Box>

      {/* Collection tree — plain scrollable list (no virtualization) */}
      <Box
        ref={listContainerRef}
        sx={{
          flexGrow: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          "&::-webkit-scrollbar": { width: 6 },
          "&::-webkit-scrollbar-thumb": { backgroundColor: alpha(theme.palette.text.primary, 0.15), borderRadius: 3 },
        }}
        onDragOver={(e) => {
          // Allow drops in the empty area below all rows
          if (dragRef.current) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }
        }}
        onDrop={handleDrop}
      >
        {collectionViews.filter((c) => c.visible).length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ px: 2, py: 2, textAlign: "center", fontSize: "0.78rem" }}
          >
            {t("collection.empty")}
          </Typography>
        ) : (
          baseRows.map((row, index) => {
            const isDropBefore = dropIndicator?.rowIndex === index && dropIndicator.position === "before";
            const isDropAfter = dropIndicator?.rowIndex === index && dropIndicator.position === "after";
            const isDropInside = dropIndicator?.rowIndex === index && dropIndicator.position === "inside";

            if (row.type === "collection") {
              const col = row.collection;
              const isOpen = row.forceOpen || collectionOpen[col.id] === true;
              const isLoaded = !!collectionTrees[col.id];
              const isLoading = !!collectionTreeLoading[col.id];
              const isDraggedItem = draggingId === col.id;

              return (
                <Box
                  key={`col-${col.id}`}
                  sx={{ position: "relative" }}
                  draggable
                  onDragStart={(e) => startDrag(e, { kind: "collection", id: col.id, collectionId: null, rowIndex: index })}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => { e.stopPropagation(); handleDrop(e); }}
                  onDragEnd={handleDragEnd}
                >
                  {isDropBefore && <DropLine position="before" />}
                  <ListItemButton
                    sx={{
                      py: 0.5,
                      minHeight: COLLECTION_ROW_HEIGHT,
                      borderRadius: 0,
                      mx: 0,
                      opacity: isDraggedItem ? 0.35 : 1,
                      transition: "opacity 0.2s ease, background-color 0.15s ease",
                      ...(isDropInside && { backgroundColor: alpha(theme.palette.primary.main, 0.1) }),
                    }}
                    onClick={() => onOpenCollection(col.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleColMenu(e, col);
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 24,
                        cursor: "pointer",
                        borderRadius: 1,
                        "&:hover": { backgroundColor: alpha(theme.palette.text.primary, 0.08) },
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!row.forceOpen) {
                          const willOpen = collectionOpen[col.id] !== true;
                          if (willOpen && !isLoaded && !isLoading) {
                            onRequestCollectionTree(col.id);
                          }
                          setCollectionOpen((prev) => ({ ...prev, [col.id]: !(prev[col.id] === true) }));
                        }
                      }}
                    >
                      {isOpen ? (
                        <ExpandMore sx={{ fontSize: 16, color: "text.secondary" }} />
                      ) : (
                        <ChevronRight sx={{ fontSize: 16, color: "text.secondary" }} />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={col.name}
                      primaryTypographyProps={{
                        variant: "body2",
                        fontWeight: 600,
                        fontSize: 12.5,
                        noWrap: true,
                      }}
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        size="small"
                        onClick={(e) => handleColMenuFromButton(e, col)}
                        sx={{
                          width: 22,
                          height: 22,
                          opacity: 0,
                          transition: "opacity 0.15s",
                          ".MuiListItemButton-root:hover &": { opacity: 1 },
                        }}
                      >
                        <MoreVert sx={{ fontSize: 14 }} />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItemButton>
                  {isDropAfter && <DropLine position="after" />}
                </Box>
              );
            }

            if (row.type === "loading") {
              return (
                <Box key={`load-${row.collectionId}`}>
                  <ListItemButton
                    sx={{
                      pl: 1.5 + row.depth * 1.5,
                      py: 0.4,
                      minHeight: ITEM_ROW_HEIGHT,
                      borderRadius: 0,
                      mx: 0,
                    }}
                  >
                    <ListItemText
                      primary={t("common.loading")}
                      primaryTypographyProps={{
                        variant: "body2",
                        fontSize: 12.5,
                        noWrap: true,
                        color: "text.secondary",
                      }}
                    />
                  </ListItemButton>
                </Box>
              );
            }

            const item = row.item;
            const depth = row.depth;
            const open = row.forceOpen || folderOpen[item.id] === true;
            const isDraggedItem = draggingId === item.id;

            return (
              <Box
                key={`item-${item.id}`}
                sx={{ position: "relative" }}
                draggable
                onDragStart={(e) => startDrag(e, { kind: "item", id: item.id, collectionId: row.collectionId, rowIndex: index })}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => { e.stopPropagation(); handleDrop(e); }}
                onDragEnd={handleDragEnd}
              >
                {isDropBefore && <DropLine position="before" />}
                <ListItemButton
                  sx={{
                    pl: 1.5 + depth * 1.5,
                    py: 0.4,
                    minHeight: ITEM_ROW_HEIGHT,
                    borderRadius: 1.5,
                    mx: 1,
                    opacity: isDraggedItem ? 0.35 : 1,
                    transition: "opacity 0.2s ease, background-color 0.15s ease",
                    ...(isDropInside && {
                      backgroundColor: alpha(theme.palette.primary.main, 0.1),
                      outline: `1.5px dashed ${alpha(theme.palette.primary.main, 0.5)}`,
                      outlineOffset: -1,
                    }),
                  }}
                  onClick={() => {
                    if (item.is_folder) {
                      onOpenFolder(item.id, row.collectionId);
                    } else if (item.request_id) {
                      onSelectRequest(item.request_id, row.collectionId, item.id);
                    }
                  }}
                  onContextMenu={(e) => handleItemContext(e, item, row.collectionId)}
                >
                  <ListItemIcon
                    sx={{ minWidth: item.is_folder ? 22 : 38, cursor: item.is_folder ? "pointer" : undefined }}
                    onClick={(e) => {
                      if (item.is_folder) {
                        e.stopPropagation();
                        if (!row.forceOpen) {
                          setFolderOpen((prev) => ({
                            ...prev,
                            [item.id]: !(prev[item.id] === true),
                          }));
                        }
                      }
                    }}
                  >
                    {item.is_folder ? (
                      open || row.forceOpen ? (
                        <ExpandMore sx={{ fontSize: 15, color: "text.secondary" }} />
                      ) : (
                        <ChevronRight sx={{ fontSize: 15, color: "text.secondary" }} />
                      )
                    ) : (
                      <Box
                        component="span"
                        sx={{
                          fontSize: "0.55rem",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          lineHeight: 1,
                          px: 0.4,
                          py: 0.2,
                          borderRadius: 0.5,
                          color: item.protocol === "websocket" ? "#14b8a6" : item.protocol === "graphql" ? "#e879f9" : (METHOD_COLORS[item.method?.toUpperCase() ?? ""] ?? theme.palette.text.secondary),
                          backgroundColor: alpha(
                            item.protocol === "websocket" ? "#14b8a6" : item.protocol === "graphql" ? "#e879f9" : (METHOD_COLORS[item.method?.toUpperCase() ?? ""] ?? theme.palette.text.secondary),
                            0.12,
                          ),
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.protocol === "websocket" ? "WS" : item.protocol === "graphql" ? "GQL" : (item.method?.toUpperCase().slice(0, 3) ?? "GET")}
                      </Box>
                    )}
                  </ListItemIcon>
                  {inlineEditId === item.id ? (
                    <TextField
                      size="small"
                      variant="standard"
                      autoFocus
                      value={inlineEditValue}
                      onChange={(e) => setInlineEditValue(e.target.value)}
                      onBlur={() => {
                        const trimmed = inlineEditValue.trim();
                        if (trimmed && trimmed !== item.name) {
                          if (onDirectRenameItem) onDirectRenameItem(item.id, trimmed);
                          else onRenameItem(item.id, trimmed);
                        }
                        setInlineEditId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        } else if (e.key === "Escape") {
                          setInlineEditId(null);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      sx={{
                        flex: 1,
                        "& .MuiInput-input": {
                          fontSize: 12.5,
                          py: 0,
                          fontFamily: "inherit",
                        },
                      }}
                      inputProps={{ style: { padding: 0 } }}
                    />
                  ) : (
                    <ListItemText
                      primary={item.name}
                      primaryTypographyProps={{
                        variant: "body2",
                        fontSize: 12.5,
                        fontWeight: item.is_folder ? 500 : 400,
                        noWrap: true,
                        color: item.is_folder ? "text.primary" : "text.secondary",
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setInlineEditId(item.id);
                        setInlineEditValue(item.name);
                      }}
                    />
                  )}
                  {item.is_folder && item.auth_type && item.auth_type !== "none" && item.auth_type !== "inherit" && (
                    <Lock sx={{ fontSize: 12, color: "warning.main", ml: 0.5, flexShrink: 0 }} />
                  )}
                  <ListItemSecondaryAction>
                    <IconButton
                      size="small"
                      onClick={(e) => handleItemMenuFromButton(e, item, row.collectionId)}
                      sx={{
                        width: 22,
                        height: 22,
                        opacity: 0,
                        transition: "opacity 0.15s",
                        ".MuiListItemButton-root:hover &": { opacity: 1 },
                      }}
                    >
                      <MoreVert sx={{ fontSize: 14 }} />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItemButton>
                {isDropAfter && <DropLine position="after" />}
              </Box>
            );
          })
        )}
      </Box>

      {/* Collection context menu */}
      <Menu
        anchorReference="anchorPosition"
        anchorPosition={colMenuPos ?? undefined}
        open={!!colMenuPos}
        onClose={() => setColMenuPos(null)}
      >
        <MuiMenuItem
          onClick={() => {
            setColMenuPos(null);
            if (!colMenuTarget) return;
            if (!collectionTrees[colMenuTarget.id]) {
              onRequestCollectionTree(colMenuTarget.id);
              return;
            }
            const next: Record<string, boolean> = {};
            for (const item of collectionItems[colMenuTarget.id] ?? []) {
              if (item.is_folder) next[item.id] = true;
            }
            setFolderOpen((prev) => ({ ...prev, ...next }));
          }}
        >
          <ExpandMore sx={{ mr: 1.5, fontSize: 16 }} /> {t("collection.expandAll")}
        </MuiMenuItem>
        <MuiMenuItem
          onClick={() => {
            setColMenuPos(null);
            if (!colMenuTarget) return;
            if (!collectionTrees[colMenuTarget.id]) {
              onRequestCollectionTree(colMenuTarget.id);
              return;
            }
            const next: Record<string, boolean> = {};
            for (const item of collectionItems[colMenuTarget.id] ?? []) {
              if (item.is_folder) next[item.id] = false;
            }
            setFolderOpen((prev) => ({ ...prev, ...next }));
          }}
        >
          <ChevronRight sx={{ mr: 1.5, fontSize: 16 }} /> {t("collection.collapseAll")}
        </MuiMenuItem>
        <Divider />
        <MuiMenuItem
          onClick={() => {
            setColMenuPos(null);
            if (colMenuTarget) onNewRequest(colMenuTarget.id);
          }}
        >
          <NoteAdd sx={{ mr: 1.5, fontSize: 16 }} /> {t("collection.addRequest")}
        </MuiMenuItem>
        <MuiMenuItem
          onClick={() => {
            setColMenuPos(null);
            if (colMenuTarget) onNewFolder(colMenuTarget.id);
          }}
        >
          <CreateNewFolder sx={{ mr: 1.5, fontSize: 16 }} />{" "}
          {t("collection.addFolder")}
        </MuiMenuItem>
        <MuiMenuItem
          onClick={() => {
            setColMenuPos(null);
            if (colMenuTarget) onRunCollection(colMenuTarget.id);
          }}
        >
          <PlayArrow sx={{ mr: 1.5, fontSize: 16 }} /> {t("collection.run")}
        </MuiMenuItem>
        <MuiMenuItem
          onClick={() => {
            setColMenuPos(null);
            if (colMenuTarget) onExportCollection(colMenuTarget.id);
          }}
        >
          <FileDownload sx={{ mr: 1.5, fontSize: 16 }} />{" "}
          {t("collection.export")}
        </MuiMenuItem>
        <MuiMenuItem
          onClick={() => {
            setColMenuPos(null);
            if (colMenuTarget) onGenerateDocs(colMenuTarget.id, colMenuTarget.name);
          }}
        >
          <AutoAwesome sx={{ mr: 1.5, fontSize: 16, color: "secondary.main" }} />{" "}
          {t("docGenerator.menuItem")}
        </MuiMenuItem>
        <MuiMenuItem
          onClick={() => {
            setColMenuPos(null);
            if (colMenuTarget) onShareDocs(colMenuTarget.id, colMenuTarget.name);
          }}
        >
          <IosShare sx={{ mr: 1.5, fontSize: 16, color: "primary.main" }} />{" "}
          {t("share.title")}
        </MuiMenuItem>
        <MuiMenuItem
          onClick={() => {
            setColMenuPos(null);
            if (colMenuTarget) onDuplicateCollection(colMenuTarget.id, colMenuTarget.name);
          }}
        >
          <ContentCopy sx={{ mr: 1.5, fontSize: 16 }} />{" "}
          {t("collection.duplicate")}
        </MuiMenuItem>
        <Divider />
        <MuiMenuItem
          onClick={() => {
            setColMenuPos(null);
            if (colMenuTarget) onEditCollection(colMenuTarget.id, colMenuTarget.name, colMenuTarget.description || "", colMenuTarget.visibility, colMenuTarget.variables || null);
          }}
        >
          <Settings sx={{ mr: 1.5, fontSize: 16 }} /> {t("collection.edit")}
        </MuiMenuItem>
        <MuiMenuItem
          onClick={() => {
            setColMenuPos(null);
            if (colMenuTarget) onRenameCollection(colMenuTarget.id, colMenuTarget.name);
          }}
        >
          <Edit sx={{ mr: 1.5, fontSize: 16 }} /> {t("common.rename")}
        </MuiMenuItem>
        <MuiMenuItem
          onClick={() => {
            setColMenuPos(null);
            if (colMenuTarget) onDeleteCollection(colMenuTarget.id, colMenuTarget.name);
          }}
        >
          <Delete sx={{ mr: 1.5, fontSize: 16 }} color="error" />{" "}
          {t("common.delete")}
        </MuiMenuItem>
      </Menu>

      {/* Item context menu */}
      <Menu
        anchorReference="anchorPosition"
        anchorPosition={itemMenuPos ?? undefined}
        open={!!itemMenuPos}
        onClose={() => setItemMenuPos(null)}
      >
        {itemMenuTarget?.is_folder ? ([
          <MuiMenuItem
            key="add-folder"
            onClick={() => {
              setItemMenuPos(null);
              if (itemMenuTarget && itemMenuCollectionId)
                onNewFolder(itemMenuCollectionId, itemMenuTarget.id);
            }}
          >
            <CreateNewFolder sx={{ mr: 1.5, fontSize: 16 }} /> {t("collection.addFolder")}
          </MuiMenuItem>,
          <MuiMenuItem
            key="add-request"
            onClick={() => {
              setItemMenuPos(null);
              if (itemMenuTarget && itemMenuCollectionId)
                onNewRequest(itemMenuCollectionId, itemMenuTarget.id);
            }}
          >
            <NoteAdd sx={{ mr: 1.5, fontSize: 16 }} /> {t("collection.addRequest")}
          </MuiMenuItem>,
          <Divider key="div" />,
          <MuiMenuItem
            key="edit-auth"
            onClick={() => {
              setItemMenuPos(null);
              if (itemMenuTarget && itemMenuCollectionId)
                onOpenFolder(itemMenuTarget.id, itemMenuCollectionId);
            }}
          >
            <Lock sx={{ mr: 1.5, fontSize: 16, color: "warning.main" }} /> {t("folder.editAuth")}
          </MuiMenuItem>,
          <MuiMenuItem
            key="export-folder"
            onClick={() => {
              setItemMenuPos(null);
              if (itemMenuTarget)
                onExportFolder(itemMenuTarget.id, itemMenuTarget.name);
            }}
          >
            <FileDownload sx={{ mr: 1.5, fontSize: 16 }} /> {t("collection.exportFolder")}
          </MuiMenuItem>,
          <MuiMenuItem
            key="generate-docs"
            onClick={() => {
              setItemMenuPos(null);
              if (itemMenuTarget && itemMenuCollectionId)
                onGenerateDocs(itemMenuCollectionId, "", itemMenuTarget.id, itemMenuTarget.name);
            }}
          >
            <AutoAwesome sx={{ mr: 1.5, fontSize: 16, color: "secondary.main" }} />{" "}
            {t("docGenerator.menuItem")}
          </MuiMenuItem>,
          <MuiMenuItem
            key="share-docs"
            onClick={() => {
              setItemMenuPos(null);
              if (itemMenuTarget && itemMenuCollectionId)
                onShareDocs(itemMenuCollectionId, "", itemMenuTarget.id, itemMenuTarget.name);
            }}
          >
            <IosShare sx={{ mr: 1.5, fontSize: 16, color: "primary.main" }} />{" "}
            {t("share.title")}
          </MuiMenuItem>,
        ]) : (
          <MuiMenuItem
            onClick={() => {
              setItemMenuPos(null);
              if (itemMenuTarget?.request_id)
                onExportRequest(itemMenuTarget.request_id, itemMenuTarget.name);
            }}
          >
            <FileDownload sx={{ mr: 1.5, fontSize: 16 }} /> {t("collection.exportRequest")}
          </MuiMenuItem>
        )}
        {!itemMenuTarget?.is_folder && itemMenuTarget?.request_id && (
          <MuiMenuItem
            onClick={() => {
              setItemMenuPos(null);
              if (itemMenuTarget?.request_id)
                onCloneItem(itemMenuTarget.id, itemMenuTarget.request_id, itemMenuTarget.name);
            }}
          >
            <ContentCopy sx={{ mr: 1.5, fontSize: 16, color: "info.main" }} /> {t("common.cloneRequest")}
          </MuiMenuItem>
        )}
        <Divider />
        <MuiMenuItem
          onClick={() => {
            setItemMenuPos(null);
            if (itemMenuTarget)
              onRenameItem(itemMenuTarget.id, itemMenuTarget.name);
          }}
        >
          <Edit sx={{ mr: 1.5, fontSize: 16 }} /> {t("common.rename")}
        </MuiMenuItem>
        <MuiMenuItem
          onClick={() => {
            setItemMenuPos(null);
            if (itemMenuTarget)
              onDeleteItem(itemMenuTarget.id, itemMenuTarget.name);
          }}
        >
          <Delete sx={{ mr: 1.5, fontSize: 16 }} color="error" />{" "}
          {t("common.delete")}
        </MuiMenuItem>
      </Menu>

      <Box
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = drawerWidth;
          const handleMove = (ev: MouseEvent) => {
            const next = Math.min(
              MAX_DRAWER_WIDTH,
              Math.max(MIN_DRAWER_WIDTH, startWidth + (ev.clientX - startX))
            );
            setDrawerWidth(next);
            try {
              localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next));
            } catch {
              /* ignore */
            }
          };
          const handleUp = () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
          };
          window.addEventListener("mousemove", handleMove);
          window.addEventListener("mouseup", handleUp);
        }}
        sx={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 6,
          cursor: "ew-resize",
          backgroundColor: "transparent",
        }}
      />
    </Drawer>
  );
}

export { DRAWER_WIDTH };
