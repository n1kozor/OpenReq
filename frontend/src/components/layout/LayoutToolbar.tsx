import { useState } from "react";
import {
  Box,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  IconButton,
  Typography,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from "@mui/material";
import {
  ViewColumn,
  ViewStream,
  ViewQuilt,
  GridView,
  RestartAlt,
  Save,
  BookmarkBorder,
  Close,
} from "@mui/icons-material";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import type { PanelLayout, CustomPreset } from "@/types";
import { MAX_CUSTOM_PRESETS } from "@/config/panelLayouts";

interface LayoutToolbarProps {
  presets: PanelLayout[];
  activePresetId: string;
  customPresets: CustomPreset[];
  onSelectPreset: (presetId: string) => void;
  onResetLayout: () => void;
  onSaveCustomPreset: (name: string) => void;
  onDeleteCustomPreset: (presetId: string) => void;
  onSelectCustomPreset: (presetId: string) => void;
  canSavePreset: boolean;
}

const PRESET_ICONS: Record<string, React.ReactNode> = {
  default: <ViewStream sx={{ fontSize: 16 }} />,
  sideBySide: <ViewColumn sx={{ fontSize: 16 }} />,
  wideResponse: <ViewQuilt sx={{ fontSize: 16 }} />,
  compact: <GridView sx={{ fontSize: 16 }} />,
};

export default function LayoutToolbar({
  presets,
  activePresetId,
  customPresets,
  onSelectPreset,
  onResetLayout,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  onSelectCustomPreset,
  canSavePreset,
}: LayoutToolbarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

  const handleOpenSaveDialog = () => {
    setPresetName("");
    setSaveDialogOpen(true);
  };

  const handleSave = () => {
    if (presetName.trim()) {
      onSaveCustomPreset(presetName.trim());
      setSaveDialogOpen(false);
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 1,
        py: 0.25,
        borderBottom: `1px solid ${isDark ? "#4e5157" : "#d1d1d1"}`,
        backgroundColor: isDark ? "#2b2d30" : "#f0f0f0",
        minHeight: 28,
        flexWrap: "wrap",
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "text.secondary",
          fontSize: "0.65rem",
          mr: 0.5,
        }}
      >
        {t("layout.title")}
      </Typography>

      <ToggleButtonGroup
        value={activePresetId}
        exclusive
        onChange={(_, value) => value && onSelectPreset(value)}
        size="small"
      >
        {presets.map((preset) => (
          <ToggleButton
            key={preset.id}
            value={preset.id}
            sx={{
              py: 0.25,
              px: 0.75,
              gap: 0.5,
              fontSize: "0.7rem",
              borderRadius: "3px !important",
            }}
          >
            <Tooltip title={t(preset.nameKey)}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                {PRESET_ICONS[preset.id] ?? <GridView sx={{ fontSize: 16 }} />}
                <Box component="span" sx={{ display: { xs: "none", md: "inline" } }}>
                  {t(preset.nameKey)}
                </Box>
              </Box>
            </Tooltip>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {/* Custom presets as chips */}
      {customPresets.map((cp) => (
        <Chip
          key={cp.id}
          icon={<BookmarkBorder sx={{ fontSize: 14 }} />}
          label={cp.name}
          onClick={() => onSelectCustomPreset(cp.id)}
          onDelete={() => onDeleteCustomPreset(cp.id)}
          deleteIcon={
            <Tooltip title={t("layout.deletePreset")}>
              <Close sx={{ fontSize: 12 }} />
            </Tooltip>
          }
          variant={activePresetId === cp.id ? "filled" : "outlined"}
          size="small"
          color={activePresetId === cp.id ? "primary" : "default"}
          sx={{
            height: 26,
            fontSize: "0.7rem",
            "& .MuiChip-icon": { fontSize: 14, ml: 0.5 },
            "& .MuiChip-deleteIcon": {
              fontSize: 12,
              opacity: 0.6,
              "&:hover": { opacity: 1 },
            },
          }}
        />
      ))}

      {/* "Customized" label when layout is modified but not saved */}
      {activePresetId === "custom" && (
        <Typography
          variant="caption"
          sx={{
            color: theme.palette.warning.main,
            fontWeight: 600,
            fontSize: "0.65rem",
          }}
        >
          {t("layout.customized")}
        </Typography>
      )}

      {/* Save button — shown when custom and under limit */}
      {canSavePreset && customPresets.length < MAX_CUSTOM_PRESETS && (
        <Tooltip title={t("layout.savePreset")}>
          <IconButton
            size="small"
            onClick={handleOpenSaveDialog}
            sx={{
              width: 26,
              height: 26,
              borderRadius: 1.5,
              color: theme.palette.warning.main,
              "&:hover": {
                color: theme.palette.primary.main,
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
              },
            }}
          >
            <Save sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}

      <Box sx={{ flexGrow: 1 }} />

      <Tooltip title={t("layout.reset")}>
        <IconButton
          size="small"
          onClick={onResetLayout}
          sx={{
            width: 26,
            height: 26,
            borderRadius: 1.5,
            color: "text.secondary",
            "&:hover": {
              color: theme.palette.primary.main,
              backgroundColor: alpha(theme.palette.primary.main, 0.08),
            },
          }}
        >
          <RestartAlt sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>

      {/* Save preset dialog */}
      <Dialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>{t("layout.savePresetTitle")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={t("layout.presetName")}
            value={presetName}
            onChange={(e) => setPresetName(e.target.value.slice(0, 20))}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)} size="small">
            {t("common.cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={!presetName.trim()}
            onClick={handleSave}
            size="small"
          >
            {t("common.save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
