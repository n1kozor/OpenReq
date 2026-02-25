import { useState, useEffect } from "react";
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
  List,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  Chip,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Divider,
} from "@mui/material";
import { Add, Delete, PlaylistAdd, Public } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { Environment, EnvironmentType } from "@/types";
import { workspacesApi } from "@/api/endpoints";

const ENV_COLORS: Record<string, string> = {
  LIVE: "#f87171",
  TEST: "#fbbf24",
  DEV: "#34d399",
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
}

/** Wizard dialog for creating a variable across all environments at once */
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
  const [key, setKey] = useState("");
  const [isSecret, setIsSecret] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setKey("");
      setIsSecret(false);
      const init: Record<string, string> = {};
      for (const env of environments) {
        init[env.id] = "";
      }
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
            InputProps={{ sx: { fontFamily: "monospace" } }}
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
              <Chip
                label={env.env_type}
                size="small"
                sx={{
                  width: 56,
                  height: 22,
                  fontSize: 11,
                  fontWeight: 700,
                  bgcolor: ENV_COLORS[env.env_type],
                  color: "#000",
                }}
              />
              <Typography variant="body2" sx={{ minWidth: 80, fontWeight: 500 }}>
                {env.name}
              </Typography>
              <TextField
                size="small"
                fullWidth
                placeholder={t("common.value")}
                value={values[env.id] ?? ""}
                onChange={(e) => setValues({ ...values, [env.id]: e.target.value })}
                type={isSecret ? "password" : "text"}
                InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }}
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
}: EnvironmentManagerProps) {
  const { t } = useTranslation();
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [showGlobals, setShowGlobals] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<EnvironmentType>("DEV");
  const [variables, setVariables] = useState<Variable[]>([]);
  const [globalsVars, setGlobalsVars] = useState<{ key: string; value: string }[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Environment | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const selectedEnv = environments.find((e) => e.id === selectedEnvId);

  // Load globals when opening globals view
  useEffect(() => {
    if (showGlobals && workspaceId) {
      workspacesApi.getGlobals(workspaceId).then((res) => {
        const g = res.data.globals || {};
        setGlobalsVars(Object.entries(g).map(([key, value]) => ({ key, value })));
      }).catch(() => setGlobalsVars([]));
    }
  }, [showGlobals, workspaceId]);

  useEffect(() => {
    if (selectedEnv) {
      setVariables(selectedEnv.variables.map((v) => ({ key: v.key, value: v.value, is_secret: v.is_secret })));
    }
  }, [selectedEnvId, environments]);

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateEnv(newName.trim(), newType, []);
    setNewName("");
    setCreating(false);
  };

  const handleSaveVars = () => {
    if (selectedEnvId) {
      onSetVariables(selectedEnvId, variables.filter((v) => v.key.trim()));
    }
  };

  const addVariable = () => {
    setVariables([...variables, { key: "", value: "", is_secret: false }]);
  };

  const updateVariable = (idx: number, field: keyof Variable, val: string | boolean) => {
    setVariables(variables.map((v, i) => (i === idx ? { ...v, [field]: val } : v)));
  };

  const removeVariable = (idx: number) => {
    setVariables(variables.filter((_, i) => i !== idx));
  };

  const handleSaveGlobals = async () => {
    if (!workspaceId) return;
    const globalsObj: Record<string, string> = {};
    for (const g of globalsVars) {
      if (g.key.trim()) globalsObj[g.key.trim()] = g.value;
    }
    await workspacesApi.updateGlobals(workspaceId, globalsObj);
    onGlobalsSaved?.();
  };

  const handleWizardSave = async (key: string, values: Record<string, { value: string; is_secret: boolean }>) => {
    for (const env of environments) {
      const envValue = values[env.id];
      if (!envValue) continue;
      const existingVars = env.variables.map((v) => ({ key: v.key, value: v.value, is_secret: v.is_secret }));
      const alreadyExists = existingVars.some((v) => v.key === key);
      if (!alreadyExists) {
        existingVars.push({ key, value: envValue.value, is_secret: envValue.is_secret });
        await onSetVariables(env.id, existingVars);
      }
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteConfirm.trim() !== "delete") return;
    onDeleteEnv(deleteTarget.id);
    setDeleteTarget(null);
    setDeleteConfirm("");
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>{t("nav.environments")}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", gap: 2, minHeight: 400 }}>
            {/* Left: env list */}
            <Box sx={{ width: 220, flexShrink: 0, borderRight: 1, borderColor: "divider", pr: 2 }}>
              {/* Globals button */}
              <ListItemButton
                selected={showGlobals}
                onClick={() => { setShowGlobals(true); setSelectedEnvId(null); }}
                sx={{ borderRadius: 1, mb: 1, bgcolor: showGlobals ? "action.selected" : "transparent" }}
              >
                <Public fontSize="small" sx={{ mr: 1, color: "#60a5fa" }} />
                <ListItemText primary="Globals" primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
              </ListItemButton>
              <Divider sx={{ mb: 1 }} />

              <Button startIcon={<Add />} size="small" onClick={() => setCreating(true)} fullWidth sx={{ mb: 1 }}>
                {t("environment.new")}
              </Button>

              {creating && (
                <Box sx={{ mb: 1, display: "flex", flexDirection: "column", gap: 1 }}>
                  <TextField size="small" placeholder={t("common.name")} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                  <FormControl size="small">
                    <Select value={newType} onChange={(e) => setNewType(e.target.value as EnvironmentType)}>
                      <MenuItem value="DEV">DEV</MenuItem>
                      <MenuItem value="TEST">TEST</MenuItem>
                      <MenuItem value="LIVE">LIVE</MenuItem>
                    </Select>
                  </FormControl>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button size="small" variant="contained" onClick={handleCreate}>{t("common.add")}</Button>
                    <Button size="small" onClick={() => setCreating(false)}>{t("common.cancel")}</Button>
                  </Box>
                </Box>
              )}

              <List dense>
                {environments.map((env) => (
                  <ListItemButton
                    key={env.id}
                    selected={selectedEnvId === env.id}
                    onClick={() => { setSelectedEnvId(env.id); setShowGlobals(false); }}
                  >
                    <ListItemText
                      primary={env.name}
                      secondary={
                        <Chip
                          label={env.env_type}
                          size="small"
                          sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: ENV_COLORS[env.env_type], color: "#000", mt: 0.5 }}
                        />
                      }
                      secondaryTypographyProps={{ component: "div" }}
                    />
                    <ListItemSecondaryAction>
                      <IconButton size="small" onClick={() => { setDeleteTarget(env); setDeleteConfirm(""); }}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItemButton>
                ))}
              </List>

              {environments.length >= 2 && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Button
                    startIcon={<PlaylistAdd />}
                    size="small"
                    fullWidth
                    variant="outlined"
                    onClick={() => setShowWizard(true)}
                  >
                    {t("environment.addVariableWizard")}
                  </Button>
                </>
              )}
            </Box>

            {/* Right: variable editor */}
            <Box sx={{ flexGrow: 1 }}>
              {showGlobals ? (
                <>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
                    Globals
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {t("environment.globalsDescription")}
                  </Typography>

                  <Table
                    size="small"
                    sx={{
                      border: 1, borderColor: "divider", borderRadius: 1,
                      "& th": { py: 0.75, px: 1.5, bgcolor: "action.hover", borderBottom: 1, borderColor: "divider", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary" },
                      "& td": { py: 0.25, px: 1.5, borderBottom: 1, borderColor: "divider", borderRight: 1, borderRightColor: "divider", "&:last-child": { borderRight: 0 } },
                      "& tr:last-child td": { borderBottom: 0 },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell>{t("environment.key")}</TableCell>
                        <TableCell>{t("environment.value")}</TableCell>
                        <TableCell sx={{ width: 40 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {globalsVars.map((g, idx) => (
                        <TableRow key={idx} sx={{ "&:hover": { bgcolor: "action.hover" } }}>
                          <TableCell>
                            <TextField
                              fullWidth size="small" variant="standard"
                              value={g.key}
                              onChange={(e) => setGlobalsVars(globalsVars.map((v, i) => i === idx ? { ...v, key: e.target.value } : v))}
                              placeholder="variable_name"
                              InputProps={{ disableUnderline: true, sx: { fontFamily: "monospace", fontSize: 13 } }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              fullWidth size="small" variant="standard"
                              value={g.value}
                              onChange={(e) => setGlobalsVars(globalsVars.map((v, i) => i === idx ? { ...v, value: e.target.value } : v))}
                              placeholder={t("common.value")}
                              InputProps={{ disableUnderline: true, sx: { fontFamily: "monospace", fontSize: 13 } }}
                            />
                          </TableCell>
                          <TableCell>
                            <IconButton size="small" onClick={() => setGlobalsVars(globalsVars.filter((_, i) => i !== idx))}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
                    <Button size="small" startIcon={<Add />} onClick={() => setGlobalsVars([...globalsVars, { key: "", value: "" }])}>
                      {t("environment.addVariable")}
                    </Button>
                    <Button size="small" variant="contained" onClick={handleSaveGlobals}>
                      {t("common.save")}
                    </Button>
                  </Box>
                </>
              ) : selectedEnv ? (
                <>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                    {selectedEnv.name} — {t("environment.variables")}
                  </Typography>

                  <Table
                    size="small"
                    sx={{
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 1,
                      "& th": {
                        py: 0.75,
                        px: 1.5,
                        bgcolor: "action.hover",
                        borderBottom: 1,
                        borderColor: "divider",
                        fontWeight: 600,
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        color: "text.secondary",
                      },
                      "& td": {
                        py: 0.25,
                        px: 1.5,
                        borderBottom: 1,
                        borderColor: "divider",
                        borderRight: 1,
                        borderRightColor: "divider",
                        "&:last-child": { borderRight: 0 },
                      },
                      "& tr:last-child td": { borderBottom: 0 },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell>{t("environment.key")}</TableCell>
                        <TableCell>{t("environment.value")}</TableCell>
                        <TableCell sx={{ width: 70 }}>{t("environment.secret")}</TableCell>
                        <TableCell sx={{ width: 40 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {variables.map((v, idx) => (
                        <TableRow key={idx} sx={{ "&:hover": { bgcolor: "action.hover" } }}>
                          <TableCell>
                            <TextField
                              fullWidth size="small" variant="standard"
                              value={v.key}
                              onChange={(e) => updateVariable(idx, "key", e.target.value)}
                              placeholder="variable_name"
                              InputProps={{ disableUnderline: true, sx: { fontFamily: "monospace", fontSize: 13 } }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              fullWidth size="small" variant="standard"
                              value={v.value}
                              onChange={(e) => updateVariable(idx, "value", e.target.value)}
                              type={v.is_secret ? "password" : "text"}
                              placeholder={t("common.value")}
                              InputProps={{ disableUnderline: true, sx: { fontFamily: "monospace", fontSize: 13 } }}
                            />
                          </TableCell>
                          <TableCell>
                            <Switch
                              size="small"
                              checked={v.is_secret}
                              onChange={(e) => updateVariable(idx, "is_secret", e.target.checked)}
                            />
                          </TableCell>
                          <TableCell>
                            <IconButton size="small" onClick={() => removeVariable(idx)}>
                              <Delete fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Box sx={{ mt: 1, display: "flex", gap: 1 }}>
                    <Button size="small" startIcon={<Add />} onClick={addVariable}>
                      {t("environment.addVariable")}
                    </Button>
                    <Button size="small" variant="contained" onClick={handleSaveVars}>
                      {t("common.save")}
                    </Button>
                  </Box>
                </>
              ) : (
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                  <Typography color="text.secondary">{t("environment.select")}</Typography>
                </Box>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
        </DialogActions>
      </Dialog>

      <AddVariableWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        environments={environments}
        onSave={handleWizardSave}
      />

      <Dialog
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteConfirm(""); }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t("environment.deleteConfirmTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("environment.deleteConfirmDesc", { name: deleteTarget?.name ?? "" })}
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder={t("environment.deleteConfirmPlaceholder")}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            autoFocus
            InputProps={{ sx: { fontFamily: "monospace" } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteTarget(null); setDeleteConfirm(""); }}>
            {t("common.cancel")}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleConfirmDelete}
            disabled={deleteConfirm.trim() !== "delete"}
          >
            {t("common.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export { ENV_COLORS };
