import {
  Box, IconButton, Tooltip, Select, MenuItem, FormControl, Typography, Chip,
} from "@mui/material";
import {
  PlayArrow, Stop, Save, AutoFixHigh, FitScreen,
  Undo, Redo, FileDownload, AutoAwesome,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { Environment } from "@/types";

interface TestFlowToolbarProps {
  flowName: string;
  isDirty: boolean;
  isRunning: boolean;
  canUndo: boolean;
  canRedo: boolean;
  environments: Environment[];
  selectedEnvId: string | null;
  onEnvChange: (envId: string | null) => void;
  onRun: () => void;
  onStop: () => void;
  onSave: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportJson: () => void;
  onAIGenerate: () => void;
  isGenerating: boolean;
  summary?: {
    total_nodes: number;
    passed_count: number;
    failed_count: number;
    skipped_count: number;
    total_time_ms: number;
  } | null;
}

export default function TestFlowToolbar({
  flowName,
  isDirty,
  isRunning,
  canUndo,
  canRedo,
  environments,
  selectedEnvId,
  onEnvChange,
  onRun,
  onStop,
  onSave,
  onAutoLayout,
  onFitView,
  onUndo,
  onRedo,
  onExportJson,
  onAIGenerate,
  isGenerating,
  summary,
}: TestFlowToolbarProps) {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1.5,
        py: 0.5,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        minHeight: 42,
      }}
    >
      <Typography variant="body2" fontWeight={600} noWrap sx={{ mr: 1, maxWidth: 200 }}>
        {flowName}
      </Typography>
      {isDirty && (
        <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#eab308", flexShrink: 0 }} />
      )}

      <Box sx={{ flex: 1 }} />

      {/* Summary chips */}
      {summary && (
        <Box sx={{ display: "flex", gap: 0.5, mr: 1 }}>
          <Chip label={`${summary.passed_count} ${t("testFlow.execution.passed")}`} size="small" color="success" sx={{ height: 22, fontSize: "0.7rem" }} />
          {summary.failed_count > 0 && (
            <Chip label={`${summary.failed_count} ${t("testFlow.execution.failed")}`} size="small" color="error" sx={{ height: 22, fontSize: "0.7rem" }} />
          )}
          {summary.skipped_count > 0 && (
            <Chip label={`${summary.skipped_count} ${t("testFlow.execution.skipped")}`} size="small" sx={{ height: 22, fontSize: "0.7rem" }} />
          )}
          <Chip
            label={summary.total_time_ms < 1000 ? `${Math.round(summary.total_time_ms)} ms` : `${(summary.total_time_ms / 1000).toFixed(2)} s`}
            size="small"
            variant="outlined"
            sx={{ height: 22, fontSize: "0.7rem" }}
          />
        </Box>
      )}

      {/* Environment selector */}
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <Select
          value={selectedEnvId || ""}
          onChange={(e) => onEnvChange(e.target.value || null)}
          displayEmpty
          sx={{ height: 28, fontSize: "0.75rem" }}
        >
          <MenuItem value="">
            <em>{t("testFlow.noEnvironment")}</em>
          </MenuItem>
          {environments.map((env) => (
            <MenuItem key={env.id} value={env.id} sx={{ fontSize: "0.8rem" }}>
              {env.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box sx={{ display: "flex", gap: 0.25, ml: 0.5 }}>
        <Tooltip title={t("testFlow.undo")}>
          <span>
            <IconButton size="small" onClick={onUndo} disabled={!canUndo || isRunning}>
              <Undo sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("testFlow.redo")}>
          <span>
            <IconButton size="small" onClick={onRedo} disabled={!canRedo || isRunning}>
              <Redo sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("testFlow.autoLayout")}>
          <IconButton size="small" onClick={onAutoLayout} disabled={isRunning}>
            <AutoFixHigh sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("testFlow.fitView")}>
          <IconButton size="small" onClick={onFitView}>
            <FitScreen sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("testFlowWizard.generate")}>
          <span>
            <IconButton
              size="small"
              onClick={onAIGenerate}
              disabled={isRunning || isGenerating}
              sx={{
                color: isGenerating ? "#eab308" : "primary.main",
                animation: isGenerating ? "spin 2s linear infinite" : undefined,
                "@keyframes spin": {
                  "0%": { transform: "rotate(0deg)" },
                  "100%": { transform: "rotate(360deg)" },
                },
              }}
            >
              <AutoAwesome sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("testFlow.exportJson")}>
          <IconButton size="small" onClick={onExportJson}>
            <FileDownload sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("testFlow.save")}>
          <IconButton size="small" onClick={onSave} disabled={isRunning}>
            <Save sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {isRunning ? (
        <Tooltip title={t("testFlow.stop")}>
          <IconButton size="small" onClick={onStop} color="error">
            <Stop sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      ) : (
        <Tooltip title={t("testFlow.run")}>
          <IconButton size="small" onClick={onRun} color="success">
            <PlayArrow sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}
