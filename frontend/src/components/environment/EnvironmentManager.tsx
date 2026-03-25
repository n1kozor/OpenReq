import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  Box,
  Typography,
  IconButton,
  Chip,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Divider,
  Tooltip,
  Alert,
} from "@mui/material";
import {
  Add,
  Delete,
  PlaylistAdd,
  Public,
  FiberManualRecord,
  Close,
  Cloud,
  VisibilityOff,
  Visibility,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import type { Environment, EnvironmentType } from "@/types";
import { workspacesApi } from "@/api/endpoints";

const ENV_COLORS: Record<string, string> = {
  LIVE: "#cf5b56",
  TEST: "#e9b84a",
  DEV: "#59a869",
};

interface Variable {
  key: string;
  value: string;
  is_secret: boolean;
}

interface EnvironmentManagerProps {
  open: boolean;
  onClose: () => void;
  environments: Environment[];
  onCreateEnv: (name: string, envType: string, variables: Variable[]) => void;
  onUpdateEnv?: (id: string, name: string, envType: string) => void;
  onDeleteEnv: (id: string) => void;
  onSetVariables: (id: string, variables: Variable[]) => void;
  workspaceId?: string | null;
  onGlobalsSaved?: () => void;
  workspaceGlobals?: Record<string, string>;
}

// ─── Add Variable Wizard ───

function AddVariableWizard({
  open,
  onClose,
  environments,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  environments: Environment[];
  onSave: (key: string, values: Record<string, { value: string; is_secret: boolean }>) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [key, setKey] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setKey("");
      setIsSecret(false);
      const init: Record<string, string> = {};
      for (const env of environments) init[env.id] = "";
      setValues(init);
    }
  }, [open, environments]);

  const handleSave = () => {
    if (!key.trim()) return;
    const result: Record<string, { value: string; is_secret: boolean }> = {};
    for (const env of environments) {
      result[env.id] = { value: values[env.id] ?? "", is_secret: isSecret };
    }
    onSave(key.trim(), result);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("environment.addVariableWizard")}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            size="small"
            label={t("environment.key")}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="BASE_URL"
            autoFocus
            InputProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: 13 } }}
          />
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Switch size="small" checked={isSecret} onChange={(e) => setIsSecret(e.target.checked)} />
            <Typography variant="body2" color="text.secondary">{t("environment.secret")}</Typography>
          </Box>
          <Divider />
          <Typography variant="subtitle2" color="text.secondary">
            {t("environment.setValuePerEnv")}
          </Typography>
          {environments.map((env) => (
            <Box key={env.id} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <FiberManualRecord sx={{ fontSize: 8, color: ENV_COLORS[env.env_type] ?? "#888" }} />
              <Typography variant="body2" sx={{ minWidth: 100, fontWeight: 500 }}>
                {env.name}
              </Typography>
              <Chip
                label={env.env_type}
                size="small"
                sx={{
                  height: 18, fontSize: "0.6rem", fontWeight: 700, borderRadius: 1,
                  backgroundColor: alpha(ENV_COLORS[env.env_type] ?? "#888", isDark ? 0.2 : 0.15),
                  color: ENV_COLORS[env.env_type] ?? "#888",
                }}
              />
              <TextField
                size="small"
                fullWidth
                placeholder={t("common.value")}
                value={values[env.id] ?? ""}
                onChange={(e) => setValues({ ...values, [env.id]: e.target.value })}
                type={isSecret ? "password" : "text"}
                InputProps={{ sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: 13 } }}
              />
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={handleSave} disabled={!key.trim()}>
          {t("environment.addToAll")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Delete Confirmation Dialog ───

function DeleteConfirmDialog({
  open,
  title,
  description,
  onClose,
  onConfirm,
  requireTyping,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => void;
  requireTyping?: boolean;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: requireTyping ? 2 : 0 }}>
          {description}
        </Typography>
        {requireTyping && (
          <TextField
            fullWidth size="small" autoFocus
            placeholder={t("environment.deleteConfirmPlaceholder")}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            InputProps={{ sx: { fontFamily: "'JetBrains Mono', monospace" } }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button
          color="error" variant="contained"
          onClick={onConfirm}
          disabled={requireTyping ? typed.trim() !== "delete" : false}
        >
          {t("common.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Variable Table ───

function VariableTable({
  variables,
  onUpdate,
  onRemove,
  showSecret,
  revealedSecrets,
  onToggleReveal,
}: {
  variables: Variable[];
  onUpdate: (idx: number, field: keyof Variable, val: string | boolean) => void;
  onRemove: (idx: number) => void;
  showSecret?: boolean;
  revealedSecrets?: Set<number>;
  onToggleReveal?: (idx: number) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const tableSx = {
    "& th": {
      py: 0.75, px: 1.5,
      bgcolor: isDark ? alpha("#fff", 0.03) : alpha("#000", 0.02),
      borderBottom: `1px solid ${theme.palette.divider}`,
      fontWeight: 600, fontSize: "0.7rem",
      textTransform: "uppercase", letterSpacing: 0.5,
      color: "text.secondary",
    },
    "& td": {
      py: 0, px: 0.5,
      borderBottom: `1px solid ${theme.palette.divider}`,
      borderRight: `1px solid ${theme.palette.divider}`,
      "&:last-child": { borderRight: 0 },
    },
    "& tr:last-child td": { borderBottom: 0 },
  };

  return (
    <Table size="small" sx={tableSx}>
      <TableHead>
        <TableRow>
          <TableCell sx={{ width: "35%" }}>{t("environment.key")}</TableCell>
          <TableCell>{t("environment.value")}</TableCell>
          {showSecret && <TableCell sx={{ width: 70 }} align="center">{t("environment.secret")}</TableCell>}
          <TableCell sx={{ width: 70 }} align="center" />
        </TableRow>
      </TableHead>
      <TableBody>
        {variables.map((v, idx) => {
          const isRevealed = revealedSecrets?.has(idx);
          return (
            <TableRow key={idx} sx={{ "&:hover": { bgcolor: isDark ? alpha("#fff", 0.02) : alpha("#000", 0.015) } }}>
              <TableCell>
                <TextField
                  fullWidth size="small" variant="standard"
                  value={v.key}
                  onChange={(e) => onUpdate(idx, "key", e.target.value)}
                  placeholder="variable_name"
                  InputProps={{ disableUnderline: true, sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: 13 } }}
                />
              </TableCell>
              <TableCell>
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <TextField
                    fullWidth size="small" variant="standard"
                    value={v.value}
                    onChange={(e) => onUpdate(idx, "value", e.target.value)}
                    type={v.is_secret && !isRevealed ? "password" : "text"}
                    placeholder={t("common.value")}
                    InputProps={{ disableUnderline: true, sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: 13 } }}
                  />
                  {v.is_secret && onToggleReveal && (
                    <IconButton size="small" onClick={() => onToggleReveal(idx)} sx={{ ml: 0.5, opacity: 0.5, "&:hover": { opacity: 1 } }}>
                      {isRevealed ? <VisibilityOff sx={{ fontSize: 14 }} /> : <Visibility sx={{ fontSize: 14 }} />}
                    </IconButton>
                  )}
                </Box>
              </TableCell>
              {showSecret && (
                <TableCell align="center">
                  <Switch
                    size="small"
                    checked={v.is_secret}
                    onChange={(e) => onUpdate(idx, "is_secret", e.target.checked)}
                  />
                </TableCell>
              )}
              <TableCell align="center">
                <IconButton size="small" onClick={() => onRemove(idx)} sx={{ opacity: 0.4, "&:hover": { opacity: 1, color: "error.main" } }}>
                  <Delete sx={{ fontSize: 16 }} />
                </IconButton>
              </TableCell>
            </TableRow>
          );
        })}
        {variables.length === 0 && (
          <TableRow>
            <TableCell colSpan={showSecret ? 4 : 3} align="center" sx={{ py: 3 }}>
              <Typography variant="body2" color="text.secondary" fontStyle="italic">
                {t("common.noItems")}
              </Typography>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

// ─── Main Component ───

export default function EnvironmentManager({
  open,
  onClose,
  environments,
  onCreateEnv,
  onUpdateEnv: _onUpdateEnv,
  onDeleteEnv,
  onSetVariables,
  workspaceId,
  onGlobalsSaved,
  workspaceGlobals,
}: EnvironmentManagerProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [showGlobals, setShowGlobals] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<EnvironmentType>("DEV");
  const [variables, setVariables] = useState<Variable[]>([]);
  const [globalsVars, setGlobalsVars] = useState<{ key: string; value: string }[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [deleteEnvTarget, setDeleteEnvTarget] = useState<Environment | null>(null);
  const [deleteVarIdx, setDeleteVarIdx] = useState<number | null>(null);
  const [deleteGlobalIdx, setDeleteGlobalIdx] = useState<number | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<number>>(new Set());

  // Track whether variables are dirty (changed since last save/load)
  const dirtyRef = useRef(false);
  const globalsDirtyRef = useRef(false);

  const selectedEnv = environments.find((e) => e.id === selectedEnvId);

  // ── Load globals ──
  useEffect(() => {
    if (showGlobals && workspaceId) {
      workspacesApi.getGlobals(workspaceId).then((res) => {
        const g = res.data.globals || {};
        setGlobalsVars(Object.entries(g).map(([key, value]) => ({ key, value })));
        globalsDirtyRef.current = false;
      }).catch(() => setGlobalsVars([]));
    }
  }, [showGlobals, workspaceId]);

  useEffect(() => {
    if (showGlobals && workspaceGlobals) {
      setGlobalsVars(Object.entries(workspaceGlobals).map(([key, value]) => ({ key, value })));
      globalsDirtyRef.current = false;
    }
  }, [showGlobals, workspaceGlobals]);

  // ── Load variables when selecting env ──
  useEffect(() => {
    if (selectedEnv) {
      setVariables(selectedEnv.variables.map((v) => ({ key: v.key, value: v.value, is_secret: v.is_secret })));
      dirtyRef.current = false;
      setRevealedSecrets(new Set());
    }
  }, [selectedEnvId, environments]);

  // ── Auto-save helpers ──
  const saveCurrentVars = useCallback(() => {
    if (selectedEnvId && dirtyRef.current) {
      onSetVariables(selectedEnvId, variables.filter((v) => v.key.trim()));
      dirtyRef.current = false;
      setSnack(t("environment.variablesSaved"));
      setTimeout(() => setSnack(null), 2000);
    }
  }, [selectedEnvId, variables, onSetVariables, t]);

  const saveCurrentGlobals = useCallback(async () => {
    if (workspaceId && globalsDirtyRef.current) {
      const globalsObj: Record<string, string> = {};
      for (const g of globalsVars) {
        if (g.key.trim()) globalsObj[g.key.trim()] = g.value;
      }
      await workspacesApi.updateGlobals(workspaceId, globalsObj);
      onGlobalsSaved?.();
      globalsDirtyRef.current = false;
      setSnack(t("environment.variablesSaved"));
      setTimeout(() => setSnack(null), 2000);
    }
  }, [workspaceId, globalsVars, onGlobalsSaved, t]);

  // ── Auto-save when switching context ──
  const handleSelectEnv = useCallback((envId: string) => {
    // Save current state before switching
    if (showGlobals) saveCurrentGlobals();
    else saveCurrentVars();
    setSelectedEnvId(envId);
    setShowGlobals(false);
  }, [showGlobals, saveCurrentGlobals, saveCurrentVars]);

  const handleSelectGlobals = useCallback(() => {
    saveCurrentVars();
    setShowGlobals(true);
    setSelectedEnvId(null);
  }, [saveCurrentVars]);

  // ── Auto-save on close ──
  const handleClose = useCallback(() => {
    if (showGlobals) saveCurrentGlobals();
    else saveCurrentVars();
    onClose();
  }, [showGlobals, saveCurrentGlobals, saveCurrentVars, onClose]);

  // ── CRUD ──
  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateEnv(newName.trim(), newType, []);
    setNewName("");
    setCreating(false);
  };

  const updateVariable = (idx: number, field: keyof Variable, val: string | boolean) => {
    setVariables((prev) => prev.map((v, i) => (i === idx ? { ...v, [field]: val } : v)));
    dirtyRef.current = true;
  };

  const removeVariable = (idx: number) => {
    setVariables((prev) => prev.filter((_, i) => i !== idx));
    dirtyRef.current = true;
    setDeleteVarIdx(null);
  };

  const addVariable = () => {
    setVariables((prev) => [...prev, { key: "", value: "", is_secret: false }]);
    dirtyRef.current = true;
  };

  const updateGlobal = (idx: number, field: "key" | "value", val: string) => {
    setGlobalsVars((prev) => prev.map((v, i) => (i === idx ? { ...v, [field]: val } : v)));
    globalsDirtyRef.current = true;
  };

  const removeGlobal = (idx: number) => {
    setGlobalsVars((prev) => prev.filter((_, i) => i !== idx));
    globalsDirtyRef.current = true;
    setDeleteGlobalIdx(null);
  };

  const addGlobal = () => {
    setGlobalsVars((prev) => [...prev, { key: "", value: "" }]);
    globalsDirtyRef.current = true;
  };

  const handleConfirmDeleteEnv = () => {
    if (!deleteEnvTarget) return;
    onDeleteEnv(deleteEnvTarget.id);
    if (selectedEnvId === deleteEnvTarget.id) {
      setSelectedEnvId(null);
      dirtyRef.current = false;
    }
    setDeleteEnvTarget(null);
  };

  const handleWizardSave = async (key: string, values: Record<string, { value: string; is_secret: boolean }>) => {
    for (const env of environments) {
      const envValue = values[env.id];
      if (!envValue) continue;
      const existingVars = env.variables.map((v) => ({ key: v.key, value: v.value, is_secret: v.is_secret }));
      if (!existingVars.some((v) => v.key === key)) {
        existingVars.push({ key, value: envValue.value, is_secret: envValue.is_secret });
        await onSetVariables(env.id, existingVars);
      }
    }
  };

  const toggleReveal = (idx: number) => {
    setRevealedSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // ── Left sidebar env item ──
  const EnvItem = ({ env }: { env: Environment }) => {
    const isSelected = selectedEnvId === env.id && !showGlobals;
    const dotColor = ENV_COLORS[env.env_type] ?? "#888";
    return (
      <Box
        onClick={() => handleSelectEnv(env.id)}
        sx={{
          display: "flex", alignItems: "center", gap: 1,
          px: 1.5, py: 0.75, borderRadius: 1.5, cursor: "pointer",
          backgroundColor: isSelected ? alpha(theme.palette.primary.main, isDark ? 0.15 : 0.08) : "transparent",
          border: isSelected ? `1px solid ${alpha(theme.palette.primary.main, 0.3)}` : "1px solid transparent",
          transition: "all 0.15s ease",
          "&:hover": {
            backgroundColor: isSelected ? undefined : (isDark ? alpha("#fff", 0.04) : alpha("#000", 0.03)),
            "& .env-delete": { opacity: 1 },
          },
        }}
      >
        <FiberManualRecord sx={{ fontSize: 8, color: dotColor, flexShrink: 0 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={isSelected ? 600 : 400} noWrap sx={{ fontSize: "0.82rem" }}>
            {env.name}
          </Typography>
        </Box>
        <Chip
          label={env.env_type}
          size="small"
          sx={{
            height: 18, fontSize: "0.6rem", fontWeight: 700, borderRadius: 1, flexShrink: 0,
            backgroundColor: alpha(dotColor, isDark ? 0.2 : 0.15),
            color: dotColor,
          }}
        />
        <IconButton
          className="env-delete"
          size="small"
          onClick={(e) => { e.stopPropagation(); setDeleteEnvTarget(env); }}
          sx={{ opacity: 0, transition: "opacity 0.15s", width: 24, height: 24, "&:hover": { color: "error.main" } }}
        >
          <Delete sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
    );
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            height: "80vh",
            maxHeight: 700,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {/* Header */}
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pb: 1, flexShrink: 0 }}>
          <Cloud sx={{ fontSize: 22, color: "primary.main" }} />
          <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
            {t("nav.environments")}
          </Typography>
          <IconButton size="small" onClick={handleClose}>
            <Close sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>

        {/* Body: fixed sidebar + scrollable content */}
        <DialogContent sx={{ display: "flex", gap: 0, p: 0, overflow: "hidden", flex: 1 }}>
          {/* ── Left sidebar (FIXED, no scroll) ── */}
          <Box
            sx={{
              width: 240, flexShrink: 0,
              borderRight: `1px solid ${theme.palette.divider}`,
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Globals button */}
            <Box sx={{ px: 1.5, pt: 1.5, pb: 1 }}>
              <Box
                onClick={handleSelectGlobals}
                sx={{
                  display: "flex", alignItems: "center", gap: 1,
                  px: 1.5, py: 0.75, borderRadius: 1.5, cursor: "pointer",
                  backgroundColor: showGlobals ? alpha(theme.palette.info.main, isDark ? 0.15 : 0.08) : "transparent",
                  border: showGlobals ? `1px solid ${alpha(theme.palette.info.main, 0.3)}` : "1px solid transparent",
                  transition: "all 0.15s ease",
                  "&:hover": {
                    backgroundColor: showGlobals ? undefined : (isDark ? alpha("#fff", 0.04) : alpha("#000", 0.03)),
                  },
                }}
              >
                <Public sx={{ fontSize: 16, color: theme.palette.info.main }} />
                <Typography variant="body2" fontWeight={showGlobals ? 600 : 400} sx={{ fontSize: "0.82rem" }}>
                  Globals
                </Typography>
                <Chip
                  label={Object.keys(workspaceGlobals ?? {}).length}
                  size="small"
                  sx={{ height: 18, fontSize: "0.6rem", fontWeight: 700, borderRadius: 1, ml: "auto" }}
                />
              </Box>
            </Box>

            <Divider />

            {/* New env button */}
            <Box sx={{ px: 1.5, pt: 1, pb: creating ? 0 : 1 }}>
              <Button
                startIcon={<Add />} size="small" fullWidth variant="outlined"
                onClick={() => setCreating(true)}
                sx={{ borderRadius: 1.5, textTransform: "none", fontSize: "0.78rem" }}
              >
                {t("environment.new")}
              </Button>
            </Box>

            {/* Inline create form */}
            {creating && (
              <Box sx={{ px: 1.5, pb: 1, display: "flex", flexDirection: "column", gap: 0.75 }}>
                <TextField
                  size="small" placeholder={t("common.name")}
                  value={newName} onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                  InputProps={{ sx: { fontSize: "0.82rem" } }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
                />
                <FormControl size="small">
                  <Select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as EnvironmentType)}
                    sx={{ fontSize: "0.82rem" }}
                  >
                    {(["DEV", "TEST", "LIVE"] as EnvironmentType[]).map((t) => (
                      <MenuItem key={t} value={t} sx={{ fontSize: "0.82rem" }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <FiberManualRecord sx={{ fontSize: 8, color: ENV_COLORS[t] }} />
                          {t}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Box sx={{ display: "flex", gap: 0.5 }}>
                  <Button size="small" variant="contained" onClick={handleCreate} sx={{ flex: 1, fontSize: "0.75rem" }}>
                    {t("common.add")}
                  </Button>
                  <Button size="small" onClick={() => setCreating(false)} sx={{ fontSize: "0.75rem" }}>
                    {t("common.cancel")}
                  </Button>
                </Box>
              </Box>
            )}

            <Divider />

            {/* Environment list (scrollable within sidebar) */}
            <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", px: 1.5, py: 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
              {environments.map((env) => (
                <EnvItem key={env.id} env={env} />
              ))}
              {environments.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", py: 3 }}>
                  {t("common.noItems")}
                </Typography>
              )}
            </Box>

            {/* Wizard button */}
            {environments.length >= 2 && (
              <Box sx={{ px: 1.5, py: 1, borderTop: `1px solid ${theme.palette.divider}` }}>
                <Tooltip title={t("environment.addVariableWizard")}>
                  <Button
                    startIcon={<PlaylistAdd />}
                    size="small" fullWidth variant="outlined"
                    onClick={() => setShowWizard(true)}
                    sx={{ borderRadius: 1.5, textTransform: "none", fontSize: "0.75rem" }}
                  >
                    {t("environment.addVariableWizard")}
                  </Button>
                </Tooltip>
              </Box>
            )}
          </Box>

          {/* ── Right content (SCROLLABLE) ── */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Auto-save notification */}
            {snack && (
              <Alert severity="success" sx={{ borderRadius: 0, py: 0, fontSize: "0.78rem" }} onClose={() => setSnack(null)}>
                {snack}
              </Alert>
            )}

            {showGlobals ? (
              /* ── Globals Editor ── */
              <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <Box sx={{ px: 2.5, pt: 2, pb: 1.5, flexShrink: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                    <Public sx={{ fontSize: 18, color: theme.palette.info.main }} />
                    <Typography variant="subtitle1" fontWeight={600}>Globals</Typography>
                    <Chip label={globalsVars.length} size="small" sx={{ height: 18, fontSize: "0.6rem", fontWeight: 700, borderRadius: 1 }} />
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {t("environment.globalsDescription")}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, pb: 1 }}>
                  <Box sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, overflow: "hidden" }}>
                    <VariableTable
                      variables={globalsVars.map((g) => ({ ...g, is_secret: false }))}
                      onUpdate={(idx, field, val) => updateGlobal(idx, field as "key" | "value", val as string)}
                      onRemove={(idx) => {
                        if (globalsVars[idx]?.key.trim()) setDeleteGlobalIdx(idx);
                        else removeGlobal(idx);
                      }}
                    />
                  </Box>
                </Box>
                <Box sx={{ px: 2.5, py: 1.5, borderTop: `1px solid ${theme.palette.divider}`, flexShrink: 0, display: "flex", gap: 1 }}>
                  <Button size="small" startIcon={<Add />} onClick={addGlobal} sx={{ textTransform: "none", fontSize: "0.78rem" }}>
                    {t("environment.addVariable")}
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button size="small" variant="contained" onClick={saveCurrentGlobals} sx={{ textTransform: "none", fontSize: "0.78rem" }}>
                    {t("common.save")}
                  </Button>
                </Box>
              </Box>
            ) : selectedEnv ? (
              /* ── Environment Variable Editor ── */
              <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <Box sx={{ px: 2.5, pt: 2, pb: 1.5, flexShrink: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                    <FiberManualRecord sx={{ fontSize: 10, color: ENV_COLORS[selectedEnv.env_type] ?? "#888" }} />
                    <Typography variant="subtitle1" fontWeight={600}>{selectedEnv.name}</Typography>
                    <Chip
                      label={selectedEnv.env_type}
                      size="small"
                      sx={{
                        height: 20, fontSize: "0.65rem", fontWeight: 700, borderRadius: 1,
                        backgroundColor: alpha(ENV_COLORS[selectedEnv.env_type] ?? "#888", isDark ? 0.2 : 0.15),
                        color: ENV_COLORS[selectedEnv.env_type] ?? "#888",
                      }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                      — {t("environment.variables")}
                    </Typography>
                    <Chip label={variables.length} size="small" sx={{ height: 18, fontSize: "0.6rem", fontWeight: 700, borderRadius: 1, ml: "auto" }} />
                  </Box>
                </Box>
                <Box sx={{ flex: 1, overflowY: "auto", px: 2.5, pb: 1 }}>
                  <Box sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, overflow: "hidden" }}>
                    <VariableTable
                      variables={variables}
                      onUpdate={updateVariable}
                      onRemove={(idx) => {
                        if (variables[idx]?.key.trim()) setDeleteVarIdx(idx);
                        else removeVariable(idx);
                      }}
                      showSecret
                      revealedSecrets={revealedSecrets}
                      onToggleReveal={toggleReveal}
                    />
                  </Box>
                </Box>
                <Box sx={{ px: 2.5, py: 1.5, borderTop: `1px solid ${theme.palette.divider}`, flexShrink: 0, display: "flex", gap: 1 }}>
                  <Button size="small" startIcon={<Add />} onClick={addVariable} sx={{ textTransform: "none", fontSize: "0.78rem" }}>
                    {t("environment.addVariable")}
                  </Button>
                  <Box sx={{ flex: 1 }} />
                  <Button size="small" variant="contained" onClick={saveCurrentVars} sx={{ textTransform: "none", fontSize: "0.78rem" }}>
                    {t("common.save")}
                  </Button>
                </Box>
              </Box>
            ) : (
              /* ── Empty state ── */
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 1 }}>
                <Cloud sx={{ fontSize: 40, color: "text.secondary", opacity: 0.3 }} />
                <Typography color="text.secondary" variant="body2">
                  {t("environment.select")}
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
      </Dialog>

      {/* Wizard */}
      <AddVariableWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        environments={environments}
        onSave={handleWizardSave}
      />

      {/* Delete environment confirm */}
      <DeleteConfirmDialog
        open={!!deleteEnvTarget}
        title={t("environment.deleteConfirmTitle")}
        description={t("environment.deleteConfirmDesc", { name: deleteEnvTarget?.name ?? "" })}
        onClose={() => setDeleteEnvTarget(null)}
        onConfirm={handleConfirmDeleteEnv}
        requireTyping
      />

      {/* Delete variable confirm */}
      <DeleteConfirmDialog
        open={deleteVarIdx !== null}
        title={t("environment.deleteVariableTitle")}
        description={t("environment.deleteVariableDesc", { name: deleteVarIdx !== null ? variables[deleteVarIdx]?.key : "" })}
        onClose={() => setDeleteVarIdx(null)}
        onConfirm={() => deleteVarIdx !== null && removeVariable(deleteVarIdx)}
      />

      {/* Delete global confirm */}
      <DeleteConfirmDialog
        open={deleteGlobalIdx !== null}
        title={t("environment.deleteVariableTitle")}
        description={t("environment.deleteVariableDesc", { name: deleteGlobalIdx !== null ? globalsVars[deleteGlobalIdx]?.key : "" })}
        onClose={() => setDeleteGlobalIdx(null)}
        onConfirm={() => deleteGlobalIdx !== null && removeGlobal(deleteGlobalIdx)}
      />
    </>
  );
}

export { ENV_COLORS };
