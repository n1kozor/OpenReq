import { Box, Typography, Paper } from "@mui/material";
import {
  Http, FolderOpen, CheckCircle, Code, Timer,
  CallSplit, Loop, DataObject, SelectAll, Cable, Hub,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { DRAGGABLE_NODE_TYPES, NODE_TYPE_CONFIGS } from "./config/nodeTypes";
import type { TestFlowNodeType } from "@/types";
import type { DragEvent } from "react";

const ICON_MAP: Record<string, React.ReactElement> = {
  Http: <Http sx={{ fontSize: 16 }} />,
  FolderOpen: <FolderOpen sx={{ fontSize: 16 }} />,
  CheckCircle: <CheckCircle sx={{ fontSize: 16 }} />,
  Code: <Code sx={{ fontSize: 16 }} />,
  Timer: <Timer sx={{ fontSize: 16 }} />,
  CallSplit: <CallSplit sx={{ fontSize: 16 }} />,
  Loop: <Loop sx={{ fontSize: 16 }} />,
  DataObject: <DataObject sx={{ fontSize: 16 }} />,
  SelectAll: <SelectAll sx={{ fontSize: 16 }} />,
  Cable: <Cable sx={{ fontSize: 16 }} />,
  Hub: <Hub sx={{ fontSize: 16 }} />,
};

export default function TestFlowPalette() {
  const { t } = useTranslation();

  const onDragStart = (event: DragEvent, nodeType: TestFlowNodeType) => {
    event.dataTransfer.setData("application/reactflow-type", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, textTransform: "uppercase", letterSpacing: 1 }}>
        {t("testFlow.palette")}
      </Typography>
      {DRAGGABLE_NODE_TYPES.map((type) => {
        const cfg = NODE_TYPE_CONFIGS[type];
        return (
          <Paper
            key={type}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              p: 0.75,
              px: 1,
              cursor: "grab",
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1.5,
              "&:hover": { borderColor: cfg.color, bgcolor: `${cfg.color}0a` },
              "&:active": { cursor: "grabbing" },
              transition: "all 0.15s",
            }}
          >
            <Box sx={{ color: cfg.color, display: "flex", alignItems: "center" }}>
              {ICON_MAP[cfg.icon]}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" fontWeight={600} noWrap sx={{ display: "block", lineHeight: 1.3 }}>
                {t(cfg.labelKey)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block", fontSize: "0.6rem", lineHeight: 1.2 }}>
                {t(cfg.descriptionKey)}
              </Typography>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
