import {
  Box,
  TextField,
  IconButton,
  Checkbox,
  Tooltip,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
} from "@mui/material";
import { Add, Delete } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { KeyValuePair } from "@/types";

interface KeyValueEditorProps {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyLabel?: string;
  valueLabel?: string;
  showDescription?: boolean;
  showEnable?: boolean;
}

let kvCounter = Date.now();
function newPair(): KeyValuePair {
  return { id: `kv-${kvCounter++}`, key: "", value: "", enabled: true };
}

export default function KeyValueEditor({
  pairs,
  onChange,
  keyLabel,
  valueLabel,
  showDescription = false,
  showEnable = true,
}: KeyValueEditorProps) {
  const { t } = useTranslation();
  const resolvedKeyLabel = keyLabel ?? t("environment.key");
  const resolvedValueLabel = valueLabel ?? t("common.value");

  const update = (id: string, field: keyof KeyValuePair, value: string | boolean) => {
    onChange(pairs.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const remove = (id: string) => {
    onChange(pairs.filter((p) => p.id !== id));
  };

  const add = () => {
    onChange([...pairs, newPair()]);
  };

  return (
    <Box>
      <TableContainer
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <Table
          size="small"
          sx={{
            tableLayout: "fixed",
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
              {showEnable && <TableCell sx={{ width: 40 }} />}
              <TableCell>{resolvedKeyLabel}</TableCell>
              <TableCell>{resolvedValueLabel}</TableCell>
              {showDescription && <TableCell>{t("common.description")}</TableCell>}
              <TableCell sx={{ width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {pairs.map((pair) => (
              <TableRow
                key={pair.id}
                sx={{
                  opacity: pair.enabled ? 1 : 0.4,
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                {showEnable && (
                  <TableCell sx={{ borderRight: 1, borderRightColor: "divider" }}>
                    <Checkbox
                      checked={pair.enabled}
                      onChange={(e) => update(pair.id, "enabled", e.target.checked)}
                      size="small"
                      sx={{ p: 0 }}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <TextField
                    fullWidth
                    size="small"
                    variant="standard"
                    placeholder={resolvedKeyLabel}
                    value={pair.key}
                    onChange={(e) => update(pair.id, "key", e.target.value)}
                    InputProps={{ disableUnderline: true, sx: { fontSize: 13, fontFamily: "monospace" } }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    fullWidth
                    size="small"
                    variant="standard"
                    placeholder={resolvedValueLabel}
                    value={pair.value}
                    onChange={(e) => update(pair.id, "value", e.target.value)}
                    InputProps={{ disableUnderline: true, sx: { fontSize: 13, fontFamily: "monospace" } }}
                  />
                </TableCell>
                {showDescription && (
                  <TableCell>
                    <TextField
                      fullWidth
                      size="small"
                      variant="standard"
                      placeholder={t("common.description")}
                      value={pair.description ?? ""}
                      onChange={(e) => update(pair.id, "description", e.target.value)}
                      InputProps={{ disableUnderline: true, sx: { fontSize: 13 } }}
                    />
                  </TableCell>
                )}
                <TableCell>
                  <Tooltip title={t("common.remove")}>
                    <IconButton size="small" onClick={() => remove(pair.id)} sx={{ p: 0.25 }}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {pairs.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={showEnable ? (showDescription ? 5 : 4) : (showDescription ? 4 : 3)}
                  sx={{ textAlign: "center", py: 2 }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {t("common.noItems")}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Box sx={{ pt: 0.5 }}>
        <IconButton size="small" onClick={add}>
          <Add fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}

export { newPair };
