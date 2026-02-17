import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  IconButton,
  Alert,
  Checkbox,
  useTheme,
} from "@mui/material";
import {
  AutoAwesome,
  Close,
  AccountTree,
  Folder,
  FolderOpen,
  ExpandMore,
  ChevronRight,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { appSettingsApi, collectionsApi } from "@/api/endpoints";
import type { Collection, CollectionItem, OllamaModel, OpenAIModel } from "@/types";

// Method color chips
const METHOD_COLORS: Record<string, string> = {
  GET: "#22c55e",
  POST: "#3b82f6",
  PUT: "#f59e0b",
  PATCH: "#a855f7",
  DELETE: "#ef4444",
  HEAD: "#64748b",
  OPTIONS: "#06b6d4",
};

interface AITestFlowWizardProps {
  open: boolean;
  onClose: () => void;
  onGenerate: (
    collectionId: string,
    strategy: string,
    extraPrompt: string | undefined,
    provider: string | undefined,
    model: string | undefined,
    requestIds: string[] | undefined,
  ) => void;
  collections: Collection[];
  isGenerating: boolean;
  nodeCount: number;
  progressPhase: string;
}

const STRATEGIES = ["comprehensive", "smoke", "authFlow", "crud"] as const;

// ── Helper: flatten tree to get all request_ids ──
function getAllRequestIds(items: CollectionItem[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    if (!item.is_folder && item.request_id) {
      ids.push(item.request_id);
    }
    if (item.children) {
      ids.push(...getAllRequestIds(item.children));
    }
  }
  return ids;
}

// ── Helper: get request_ids under a folder ──
function getFolderRequestIds(item: CollectionItem): string[] {
  if (!item.is_folder || !item.children) return [];
  return getAllRequestIds(item.children);
}

// ── Recursive tree item renderer ──
function RequestTreeItem({
  item,
  selectedIds,
  onToggle,
  onToggleFolder,
  depth = 0,
}: {
  item: CollectionItem;
  selectedIds: Set<string>;
  onToggle: (requestId: string) => void;
  onToggleFolder: (requestIds: string[], checked: boolean) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);

  if (item.is_folder) {
    const childRequestIds = getFolderRequestIds(item);
    const allChecked = childRequestIds.length > 0 && childRequestIds.every((id) => selectedIds.has(id));
    const someChecked = childRequestIds.some((id) => selectedIds.has(id));

    return (
      <Box>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            pl: depth * 2,
            py: 0.25,
            "&:hover": { bgcolor: "action.hover" },
            borderRadius: 1,
            cursor: "pointer",
          }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ExpandMore sx={{ fontSize: 16, color: "text.secondary" }} />
          ) : (
            <ChevronRight sx={{ fontSize: 16, color: "text.secondary" }} />
          )}
          <Checkbox
            size="small"
            checked={allChecked}
            indeterminate={someChecked && !allChecked}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleFolder(childRequestIds, !allChecked)}
            sx={{ p: 0.25, mr: 0.5 }}
          />
          {expanded ? (
            <FolderOpen sx={{ fontSize: 16, color: "#f59e0b", mr: 0.5 }} />
          ) : (
            <Folder sx={{ fontSize: 16, color: "#f59e0b", mr: 0.5 }} />
          )}
          <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1 }}>
            {item.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
            {childRequestIds.length}
          </Typography>
        </Box>
        {expanded && item.children && (
          <Box>
            {item.children.map((child) => (
              <RequestTreeItem
                key={child.id}
                item={child}
                selectedIds={selectedIds}
                onToggle={onToggle}
                onToggleFolder={onToggleFolder}
                depth={depth + 1}
              />
            ))}
          </Box>
        )}
      </Box>
    );
  }

  // Request item
  if (!item.request_id) return null;
  const method = item.method || "GET";
  const protocol = item.protocol || "http";
  const isWs = protocol === "websocket";
  const isGql = protocol === "graphql";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        pl: depth * 2 + 2,
        py: 0.25,
        "&:hover": { bgcolor: "action.hover" },
        borderRadius: 1,
        cursor: "pointer",
      }}
      onClick={() => onToggle(item.request_id!)}
    >
      <Checkbox
        size="small"
        checked={selectedIds.has(item.request_id)}
        sx={{ p: 0.25, mr: 0.5 }}
        tabIndex={-1}
      />
      {isWs ? (
        <Chip label="WS" size="small" sx={{ height: 16, fontSize: "0.6rem", fontWeight: 700, bgcolor: "#14b8a6", color: "#fff", mr: 0.5, minWidth: 32 }} />
      ) : isGql ? (
        <Chip label="GQL" size="small" sx={{ height: 16, fontSize: "0.6rem", fontWeight: 700, bgcolor: "#e879f9", color: "#fff", mr: 0.5, minWidth: 32 }} />
      ) : (
        <Chip
          label={method}
          size="small"
          sx={{
            height: 16,
            fontSize: "0.6rem",
            fontWeight: 700,
            bgcolor: METHOD_COLORS[method] || "#64748b",
            color: "#fff",
            mr: 0.5,
            minWidth: 32,
          }}
        />
      )}
      <Typography variant="body2" noWrap sx={{ flex: 1 }}>
        {item.name}
      </Typography>
    </Box>
  );
}

export default function AITestFlowWizard({
  open,
  onClose,
  onGenerate,
  collections,
  isGenerating,
  nodeCount,
  progressPhase,
}: AITestFlowWizardProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const [collectionId, setCollectionId] = useState("");
  const [strategy, setStrategy] = useState<string>("comprehensive");
  const [extraPrompt, setExtraPrompt] = useState("");
  const [aiProvider, setAiProvider] = useState<"openai" | "ollama">("openai");
  const [ollamaModel, setOllamaModel] = useState("");
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [openaiModel, setOpenaiModel] = useState("");
  const [openaiModels, setOpenaiModels] = useState<OpenAIModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [error, setError] = useState("");
  const loadedRef = useRef(false);

  // Request tree
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());

  // Load settings on open
  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    appSettingsApi.get().then(({ data }) => {
      if (data.ai_provider) setAiProvider(data.ai_provider as "openai" | "ollama");
      if (data.openai_model) setOpenaiModel(data.openai_model);
      if (data.ollama_model) setOllamaModel(data.ollama_model);

      if (data.has_openai_key) {
        appSettingsApi.getOpenAIModels().then(({ data: m }) => setOpenaiModels(m)).catch(() => {});
      }
      if (data.ai_provider === "ollama" && data.has_ollama_url) {
        setModelsLoading(true);
        appSettingsApi.getOllamaModels(data.ollama_base_url || undefined)
          .then(({ data: m }) => setOllamaModels(m))
          .catch(() => {})
          .finally(() => setModelsLoading(false));
      }
    });
  }, [open]);

  // Load collection items when collection changes
  useEffect(() => {
    if (!collectionId) {
      setCollectionItems([]);
      setSelectedRequestIds(new Set());
      return;
    }
    setItemsLoading(true);
    collectionsApi.listItems(collectionId)
      .then(({ data }) => {
        setCollectionItems(data);
        // Select all by default
        const allIds = getAllRequestIds(data);
        setSelectedRequestIds(new Set(allIds));
      })
      .catch(() => setCollectionItems([]))
      .finally(() => setItemsLoading(false));
  }, [collectionId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      loadedRef.current = false;
      setError("");
    }
  }, [open]);

  const handleToggleRequest = useCallback((requestId: string) => {
    setSelectedRequestIds((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  }, []);

  const handleToggleFolder = useCallback((requestIds: string[], checked: boolean) => {
    setSelectedRequestIds((prev) => {
      const next = new Set(prev);
      for (const id of requestIds) {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const allIds = getAllRequestIds(collectionItems);
    setSelectedRequestIds(new Set(allIds));
  }, [collectionItems]);

  const handleSelectNone = useCallback(() => {
    setSelectedRequestIds(new Set());
  }, []);

  const handleGenerate = useCallback(() => {
    if (!collectionId || selectedRequestIds.size === 0) return;
    setError("");
    const model = aiProvider === "ollama" ? ollamaModel : openaiModel || undefined;
    const allIds = getAllRequestIds(collectionItems);
    // If all are selected, don't send request_ids (backend uses all)
    const requestIds = selectedRequestIds.size === allIds.length ? undefined : Array.from(selectedRequestIds);
    onGenerate(collectionId, strategy, extraPrompt || undefined, aiProvider, model, requestIds);
  }, [collectionId, strategy, extraPrompt, aiProvider, ollamaModel, openaiModel, selectedRequestIds, collectionItems, onGenerate]);

  const allIds = getAllRequestIds(collectionItems);
  const canGenerate = !!collectionId && selectedRequestIds.size > 0 && !(aiProvider === "ollama" && !ollamaModel);

  return (
    <Dialog
      open={open}
      onClose={isGenerating ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          background:
            theme.palette.mode === "dark"
              ? "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)"
              : "linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%)",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pb: 1 }}>
        <AutoAwesome sx={{ fontSize: 28, color: "primary.main" }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={700}>
            {t("testFlowWizard.title")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("testFlowWizard.subtitle")}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small" disabled={isGenerating}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {!isGenerating ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            {/* Collection Picker */}
            <FormControl fullWidth>
              <InputLabel>{t("testFlowWizard.collection")}</InputLabel>
              <Select
                value={collectionId}
                label={t("testFlowWizard.collection")}
                onChange={(e) => setCollectionId(e.target.value)}
              >
                {collections.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <AccountTree sx={{ fontSize: 16, opacity: 0.5 }} />
                      {c.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Request tree with checkboxes */}
            {collectionId && (
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {t("testFlowWizard.requests")}
                    {allIds.length > 0 && (
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        ({selectedRequestIds.size}/{allIds.length})
                      </Typography>
                    )}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Button size="small" onClick={handleSelectAll} sx={{ minWidth: 0, fontSize: "0.7rem", textTransform: "none" }}>
                      {t("testFlowWizard.selectAll")}
                    </Button>
                    <Button size="small" onClick={handleSelectNone} sx={{ minWidth: 0, fontSize: "0.7rem", textTransform: "none" }}>
                      {t("testFlowWizard.selectNone")}
                    </Button>
                  </Box>
                </Box>
                <Box
                  sx={{
                    maxHeight: 200,
                    overflowY: "auto",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1.5,
                    p: 0.5,
                    bgcolor: theme.palette.mode === "dark" ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.02)",
                  }}
                >
                  {itemsLoading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : collectionItems.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 1, textAlign: "center" }}>
                      {t("testFlowWizard.noRequests")}
                    </Typography>
                  ) : (
                    collectionItems.map((item) => (
                      <RequestTreeItem
                        key={item.id}
                        item={item}
                        selectedIds={selectedRequestIds}
                        onToggle={handleToggleRequest}
                        onToggleFolder={handleToggleFolder}
                      />
                    ))
                  )}
                </Box>
              </Box>
            )}

            {/* Strategy */}
            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                {t("testFlowWizard.strategy")}
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {STRATEGIES.map((s) => (
                  <Chip
                    key={s}
                    label={t(`testFlowWizard.strategies.${s}`)}
                    variant={strategy === s ? "filled" : "outlined"}
                    color={strategy === s ? "primary" : "default"}
                    onClick={() => setStrategy(s)}
                    sx={{ fontWeight: strategy === s ? 700 : 400 }}
                  />
                ))}
              </Box>
            </Box>

            {/* AI Provider */}
            <Box>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                {t("testFlowWizard.aiProvider")}
              </Typography>
              <ToggleButtonGroup
                value={aiProvider}
                exclusive
                onChange={(_, v) => v && setAiProvider(v)}
                fullWidth
                size="small"
              >
                <ToggleButton value="openai">OpenAI</ToggleButton>
                <ToggleButton value="ollama">Ollama</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Model Select */}
            {aiProvider === "openai" && (
              <FormControl fullWidth size="small">
                <InputLabel>{t("testFlowWizard.model")}</InputLabel>
                <Select
                  value={openaiModel}
                  label={t("testFlowWizard.model")}
                  onChange={(e) => setOpenaiModel(e.target.value)}
                >
                  {openaiModels.length > 0
                    ? openaiModels.map((m) => (
                        <MenuItem key={m.id} value={m.id}>{m.id}</MenuItem>
                      ))
                    : [
                        <MenuItem key="gpt-4.1-mini" value="gpt-4.1-mini">gpt-4.1-mini</MenuItem>,
                        <MenuItem key="gpt-4.1" value="gpt-4.1">gpt-4.1</MenuItem>,
                      ]}
                </Select>
              </FormControl>
            )}

            {aiProvider === "ollama" && (
              <FormControl fullWidth size="small">
                <InputLabel>{t("testFlowWizard.model")}</InputLabel>
                <Select
                  value={ollamaModel}
                  label={t("testFlowWizard.model")}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  disabled={modelsLoading}
                  endAdornment={
                    modelsLoading ? <CircularProgress size={18} sx={{ mr: 2 }} /> : undefined
                  }
                >
                  {ollamaModels.map((m) => (
                    <MenuItem key={m.name} value={m.name}>{m.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Extra Prompt */}
            <TextField
              label={t("testFlowWizard.extraPrompt")}
              placeholder={t("testFlowWizard.extraPromptHint")}
              multiline
              rows={2}
              value={extraPrompt}
              onChange={(e) => setExtraPrompt(e.target.value)}
              fullWidth
              size="small"
            />
          </Box>
        ) : (
          /* Generating phase */
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2.5,
              py: 3,
            }}
          >
            <AutoAwesome
              sx={{
                fontSize: 48,
                color: "primary.main",
                animation: "spin 2s linear infinite",
                "@keyframes spin": {
                  "0%": { transform: "rotate(0deg)" },
                  "100%": { transform: "rotate(360deg)" },
                },
              }}
            />
            <Typography variant="h6" fontWeight={600}>
              {t("testFlowWizard.generating")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {progressPhase === "collecting" && t("testFlowWizard.analyzing")}
              {progressPhase === "collected" && t("testFlowWizard.analyzing")}
              {progressPhase === "generating" && t("testFlowWizard.generating")}
              {progressPhase === "creating_nodes" && t("testFlowWizard.creatingNodes")}
              {progressPhase === "creating_edges" && t("testFlowWizard.creatingEdges")}
            </Typography>
            {nodeCount > 0 && (
              <Chip
                label={t("testFlowWizard.nodesCreated", { count: nodeCount })}
                color="primary"
                variant="outlined"
                size="small"
                sx={{ fontWeight: 600 }}
              />
            )}
            <LinearProgress sx={{ width: "100%", maxWidth: 350, borderRadius: 2 }} />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        {!isGenerating ? (
          <>
            <Button onClick={onClose} color="inherit">
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleGenerate}
              variant="contained"
              startIcon={<AutoAwesome />}
              disabled={!canGenerate}
            >
              {t("testFlowWizard.generate")}
              {selectedRequestIds.size > 0 && ` (${selectedRequestIds.size})`}
            </Button>
          </>
        ) : (
          <Button onClick={onClose} color="inherit">
            {t("common.cancel")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
