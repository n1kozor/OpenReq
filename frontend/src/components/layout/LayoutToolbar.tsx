import { Box, ToggleButtonGroup, ToggleButton, Tooltip, IconButton, Typography } from "@mui/material";
import {
  ViewColumn,
  ViewStream,
  ViewQuilt,
  GridView,
  RestartAlt,
} from "@mui/icons-material";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import type { PanelLayout } from "@/types";

interface LayoutToolbarProps {
  presets: PanelLayout[];
  activePresetId: string;
  onSelectPreset: (presetId: string) => void;
  onResetLayout: () => void;
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
  onSelectPreset,
  onResetLayout,
}: LayoutToolbarProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 2,
        py: 0.5,
        borderBottom: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.06)}`,
        backgroundColor: alpha(isDark ? "#0d1117" : "#f8fafc", isDark ? 0.3 : 0.5),
        minHeight: 36,
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
              px: 1,
              gap: 0.5,
              fontSize: "0.7rem",
              borderRadius: "6px !important",
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
    </Box>
  );
}
