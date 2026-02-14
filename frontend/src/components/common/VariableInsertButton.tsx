import { useState } from "react";
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemText,
  Typography,
  Box,
  Tooltip,
  Divider,
} from "@mui/material";
import { DataObject } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { EnvironmentVariable } from "@/types";

interface VariableInsertButtonProps {
  variables: EnvironmentVariable[];
  onInsert: (variableKey: string) => void;
  size?: "small" | "medium";
}

export default function VariableInsertButton({
  variables,
  onInsert,
  size = "small",
}: VariableInsertButtonProps) {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  if (variables.length === 0) return null;

  return (
    <>
      <Tooltip title={t("environment.insertVariable")}>
        <IconButton
          size={size}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ color: "primary.main" }}
        >
          <DataObject fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={() => setAnchorEl(null)}
        slotProps={{ paper: { sx: { minWidth: 200, maxHeight: 300 } } }}
      >
        <Box sx={{ px: 2, py: 0.5 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            {t("environment.insertVariable")}
          </Typography>
        </Box>
        <Divider />
        {variables.map((v) => (
          <MenuItem
            key={v.id}
            onClick={() => {
              onInsert(v.key);
              setAnchorEl(null);
            }}
            dense
          >
            <ListItemText
              primary={
                <Typography variant="body2" fontFamily="monospace" fontSize={13}>
                  {`{{${v.key}}}`}
                </Typography>
              }
              secondary={
                v.is_secret
                  ? "******"
                  : v.value
                    ? v.value.length > 30 ? v.value.slice(0, 30) + "..." : v.value
                    : undefined
              }
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
