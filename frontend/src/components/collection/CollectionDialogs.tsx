import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  IconButton,
  Divider,
} from "@mui/material";
import { Add, DeleteOutline } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { CollectionItem } from "@/types";

// ── Create Collection Dialog ──
interface CreateCollectionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description: string, visibility: "private" | "shared") => void;
}

export function CreateCollectionDialog({ open, onClose, onCreate }: CreateCollectionDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "shared">("private");

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), description.trim(), visibility);
    setName("");
    setDescription("");
    setVisibility("private");
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("collection.new")}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            autoFocus
            label={t("collection.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <TextField
            label={t("collection.description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
          <FormControl fullWidth size="small">
            <InputLabel>{t("collection.visibility")}</InputLabel>
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as "private" | "shared")} label={t("collection.visibility")}>
              <MenuItem value="private">{t("collection.private")}</MenuItem>
              <MenuItem value="shared">{t("collection.shared")}</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={handleCreate} disabled={!name.trim()}>
          {t("common.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Create Folder Dialog ──
interface CreateFolderDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function CreateFolderDialog({ open, onClose, onCreate }: CreateFolderDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("collection.newFolder")}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={t("collection.folderName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={handleCreate} disabled={!name.trim()}>
          {t("common.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Edit Collection Dialog ──
interface VarRow { key: string; value: string }

interface EditCollectionDialogProps {
  open: boolean;
  collection: { name: string; description?: string; visibility: "private" | "shared"; variables?: Record<string, string> | null } | null;
  onClose: () => void;
  onUpdate: (name: string, description: string, visibility: "private" | "shared", variables: Record<string, string>) => void;
}

export function EditCollectionDialog({ open, collection, onClose, onUpdate }: EditCollectionDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(collection?.name || "");
  const [description, setDescription] = useState(collection?.description || "");
  const [visibility, setVisibility] = useState<"private" | "shared">(collection?.visibility || "private");
  const [vars, setVars] = useState<VarRow[]>([{ key: "", value: "" }]);

  // Sync with collection prop when it changes
  useEffect(() => {
    if (collection) {
      setName(collection.name);
      setDescription(collection.description || "");
      setVisibility(collection.visibility);
      const entries = Object.entries(collection.variables || {});
      setVars(entries.length > 0 ? [...entries.map(([key, value]) => ({ key, value })), { key: "", value: "" }] : [{ key: "", value: "" }]);
    }
  }, [collection]);

  const handleUpdate = () => {
    if (!name.trim()) return;
    const variables: Record<string, string> = {};
    for (const v of vars) {
      if (v.key.trim()) variables[v.key.trim()] = v.value;
    }
    onUpdate(name.trim(), description.trim(), visibility, variables);
    onClose();
  };

  const updateVar = (index: number, field: "key" | "value", val: string) => {
    setVars((prev) => {
      const next = [...prev];
      const cur = next[index] ?? { key: "", value: "" };
      next[index] = { key: cur.key, value: cur.value, [field]: val };
      // Auto-add empty row if typing in last row
      if (index === next.length - 1 && val.trim()) {
        next.push({ key: "", value: "" });
      }
      return next;
    });
  };

  const removeVar = (index: number) => {
    setVars((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length === 0 ? [{ key: "", value: "" }] : next;
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("collection.edit")}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            autoFocus
            label={t("collection.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
          <TextField
            label={t("collection.description")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
          <FormControl fullWidth size="small">
            <InputLabel>{t("collection.visibility")}</InputLabel>
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as "private" | "shared")} label={t("collection.visibility")}>
              <MenuItem value="private">{t("collection.private")}</MenuItem>
              <MenuItem value="shared">{t("collection.shared")}</MenuItem>
            </Select>
          </FormControl>

          <Divider />

          <Typography variant="body2" fontWeight={600}>
            {t("collection.variables")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("collection.variablesHint")}
          </Typography>

          {vars.map((v, i) => (
            <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <TextField
                size="small"
                placeholder={t("common.key")}
                value={v.key}
                onChange={(e) => updateVar(i, "key", e.target.value)}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                placeholder={t("common.value")}
                value={v.value}
                onChange={(e) => updateVar(i, "value", e.target.value)}
                sx={{ flex: 1 }}
              />
              <IconButton size="small" onClick={() => removeVar(i)} disabled={vars.length === 1 && !v.key}>
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Button
            size="small"
            startIcon={<Add />}
            onClick={() => setVars((prev) => [...prev, { key: "", value: "" }])}
            sx={{ alignSelf: "flex-start" }}
          >
            {t("collection.addVariable")}
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={handleUpdate} disabled={!name.trim()}>
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Rename Dialog ──
interface RenameDialogProps {
  open: boolean;
  currentName: string;
  onClose: () => void;
  onRename: (name: string) => void;
}

export function RenameDialog({ open, currentName, onClose, onRename }: RenameDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(currentName);

  const handleRename = () => {
    if (!name.trim()) return;
    onRename(name.trim());
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("common.rename")}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={t("common.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleRename()}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={handleRename} disabled={!name.trim()}>
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Confirm Delete Dialog ──
interface ConfirmDeleteDialogProps {
  open: boolean;
  itemName: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteDialog({ open, itemName, onClose, onConfirm }: ConfirmDeleteDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("common.confirm")}</DialogTitle>
      <DialogContent>
        <Typography
          dangerouslySetInnerHTML={{ __html: t("common.deleteConfirm", { name: itemName }) }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" color="error" onClick={() => { onConfirm(); onClose(); }}>
          {t("common.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Duplicate Collection Dialog ──
interface DuplicateCollectionDialogProps {
  open: boolean;
  originalName: string;
  onClose: () => void;
  onDuplicate: (newName: string) => void;
}

export function DuplicateCollectionDialog({ open, originalName, onClose, onDuplicate }: DuplicateCollectionDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(`${originalName} (Copy)`);
  const isSameName = name.trim() === originalName;

  useEffect(() => {
    if (open) setName(`${originalName} (Copy)`);
  }, [open, originalName]);

  const handleDuplicate = () => {
    if (!name.trim() || isSameName) return;
    onDuplicate(name.trim());
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t("collection.duplicateTitle")}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={t("collection.duplicateNameLabel")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleDuplicate()}
          error={isSameName}
          helperText={isSameName ? t("collection.duplicateNameError") : ""}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={handleDuplicate} disabled={!name.trim() || isSameName}>
          {t("common.create")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Save Request Dialog ──
interface SaveRequestDialogProps {
  open: boolean;
  collections: { id: string; name: string }[];
  onClose: () => void;
  onSave: (name: string, collectionId: string, folderId?: string) => void;
  defaultName?: string;
  collectionTrees: Record<string, CollectionItem[]>;
  onRequestCollectionTree?: (collectionId: string) => void;
  defaultCollectionId?: string;
  defaultFolderId?: string;
}

export function SaveRequestDialog({
  open,
  collections,
  onClose,
  onSave,
  defaultName = "",
  collectionTrees,
  onRequestCollectionTree,
  defaultCollectionId,
  defaultFolderId,
}: SaveRequestDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(defaultName);
  const [collectionId, setCollectionId] = useState(defaultCollectionId ?? collections[0]?.id ?? "");
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    const nextCollectionId = defaultCollectionId ?? collections[0]?.id ?? "";
    setCollectionId(nextCollectionId);
    setFolderId(defaultFolderId ?? "");
  }, [open, defaultName, defaultCollectionId, defaultFolderId, collections]);

  useEffect(() => {
    if (!open || !collectionId) return;
    if (!collectionTrees[collectionId]) {
      onRequestCollectionTree?.(collectionId);
    }
  }, [open, collectionId, collectionTrees, onRequestCollectionTree]);

  const folderOptions = useMemo(() => {
    const tree = collectionTrees[collectionId] ?? [];
    const rows: { id: string; name: string; depth: number }[] = [];
    const walk = (nodes: CollectionItem[], depth: number) => {
      for (const node of nodes) {
        if (node.is_folder) {
          rows.push({ id: node.id, name: node.name, depth });
          if (node.children?.length) walk(node.children, depth + 1);
        }
      }
    };
    walk(tree, 0);
    return rows;
  }, [collectionId, collectionTrees]);

  useEffect(() => {
    if (!folderId) return;
    if (!folderOptions.find((f) => f.id === folderId)) {
      setFolderId("");
    }
  }, [folderId, folderOptions]);

  const handleSave = () => {
    if (!name.trim() || !collectionId) return;
    onSave(name.trim(), collectionId, folderId || undefined);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t("request.saveRequest")}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            autoFocus
            label={t("request.requestName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
          <FormControl fullWidth size="small">
            <InputLabel>{t("collection.collection")}</InputLabel>
            <Select value={collectionId} onChange={(e) => setCollectionId(e.target.value)} label={t("collection.collection")}>
              {collections.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>{t("collection.folder")}</InputLabel>
            <Select value={folderId} onChange={(e) => setFolderId(e.target.value)} label={t("collection.folder")}>
              <MenuItem value="">{t("request.none")}</MenuItem>
              {folderOptions.map((f) => (
                <MenuItem key={f.id} value={f.id} sx={{ pl: 2 + f.depth * 1.5 }}>
                  {f.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="contained" onClick={handleSave} disabled={!name.trim() || !collectionId}>
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
