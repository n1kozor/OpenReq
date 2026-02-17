import { useRef, useState, useMemo, useCallback } from "react";
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
  Popper,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListSubheader,
  ClickAwayListener,
} from "@mui/material";
import { Add, Delete } from "@mui/icons-material";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import type { KeyValuePair } from "@/types";
import type { VariableInfo, VariableGroup } from "@/hooks/useVariableGroups";

interface KeyValueEditorProps {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyLabel?: string;
  valueLabel?: string;
  showDescription?: boolean;
  showEnable?: boolean;
  resolvedVariables?: Map<string, VariableInfo>;
  variableGroups?: VariableGroup[];
}

let kvCounter = Date.now();
function newPair(): KeyValuePair {
  return { id: `kv-${kvCounter++}`, key: "", value: "", enabled: true };
}

// ── Variable segment parser ──
interface Segment {
  type: "text" | "variable";
  text: string;
  variableName?: string;
}

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const regex = /\{\{(\w+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "variable", text: match[0], variableName: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }
  return segments;
}

function hasVariables(text: string): boolean {
  return /\{\{\w+\}\}/.test(text);
}

// ── VariableValueCell: renders value with colored {{variable}} + tooltip + autocomplete ──
function VariableValueCell({
  value,
  onChange,
  placeholder,
  resolvedVariables,
  masked = false,
  variableGroups = [],
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  resolvedVariables?: Map<string, VariableInfo>;
  masked?: boolean;
  variableGroups?: VariableGroup[];
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const showOverlay = resolvedVariables && hasVariables(value) && !masked;

  // Autocomplete state
  const [acOpen, setAcOpen] = useState(false);
  const [acFilter, setAcFilter] = useState("");
  const [acCursorPos, setAcCursorPos] = useState(0);
  const [acSelectedIndex, setAcSelectedIndex] = useState(0);

  const varColor = theme.palette.info.main;
  const unresolvedColor = theme.palette.error.main;

  // ── Autocomplete data ──
  const flatVariables = useMemo(() => {
    const items: { item: VariableInfo; groupLabel: string }[] = [];
    for (const g of variableGroups) {
      for (const item of g.items) {
        items.push({ item, groupLabel: t(g.label) });
      }
    }
    return items;
  }, [variableGroups, t]);

  const filteredVariables = useMemo(() => {
    if (!acFilter) return flatVariables;
    const lower = acFilter.toLowerCase();
    return flatVariables.filter((v) => v.item.key.toLowerCase().includes(lower));
  }, [flatVariables, acFilter]);

  const groupedFiltered = useMemo(() => {
    const map = new Map<string, { label: string; items: VariableInfo[] }>();
    for (const { item, groupLabel } of filteredVariables) {
      let group = map.get(groupLabel);
      if (!group) {
        group = { label: groupLabel, items: [] };
        map.set(groupLabel, group);
      }
      group.items.push(item);
    }
    return [...map.values()];
  }, [filteredVariables]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      if (variableGroups.length === 0) return;

      const cursorPos = e.target.selectionStart ?? newValue.length;
      const textBefore = newValue.slice(0, cursorPos);
      const match = textBefore.match(/\{\{([^{}]*)$/);

      if (match) {
        setAcOpen(true);
        setAcFilter(match[1] ?? "");
        setAcCursorPos(cursorPos);
        setAcSelectedIndex(0);
      } else {
        setAcOpen(false);
      }
    },
    [onChange, variableGroups.length],
  );

  const handleSelectVariable = useCallback(
    (varKey: string) => {
      const textBefore = value.slice(0, acCursorPos);
      const match = textBefore.match(/\{\{([^{}]*)$/);
      if (!match) return;

      const insertStart = textBefore.length - match[0].length;
      const newValue = value.slice(0, insertStart) + `{{${varKey}}}` + value.slice(acCursorPos);
      onChange(newValue);
      setAcOpen(false);

      const newCursorPos = insertStart + varKey.length + 4;
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      });
    },
    [value, acCursorPos, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!acOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAcSelectedIndex((prev) => Math.min(prev + 1, filteredVariables.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setAcSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredVariables[acSelectedIndex]) {
          handleSelectVariable(filteredVariables[acSelectedIndex].item.key);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setAcOpen(false);
      }
    },
    [acOpen, acSelectedIndex, filteredVariables, handleSelectVariable],
  );

  const buildTooltip = (varName: string) => {
    const info = resolvedVariables?.get(varName);
    if (info) {
      const sourceLabel =
        info.source === "environment"
          ? t("variable.environment")
          : info.source === "collection"
            ? t("variable.collection")
            : t("variable.globals");
      return (
        <Box sx={{ p: 0.5 }}>
          <Typography variant="caption" fontFamily="monospace" fontWeight={700} display="block">
            {`{{${varName}}}`}
          </Typography>
          <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
            {t("variable.value")}: <strong>{info.value.length > 60 ? info.value.slice(0, 60) + "..." : info.value}</strong>
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary">
            {t("variable.source")}: {sourceLabel}
          </Typography>
        </Box>
      );
    }
    return (
      <Box sx={{ p: 0.5 }}>
        <Typography variant="caption" fontFamily="monospace" fontWeight={700} display="block">
          {`{{${varName}}}`}
        </Typography>
        <Typography variant="caption" display="block" color="error.main" sx={{ mt: 0.5 }}>
          {t("variable.unresolved")}
        </Typography>
      </Box>
    );
  };

  return (
    <Box ref={containerRef} sx={{ position: "relative" }}>
      <TextField
        fullWidth
        size="small"
        variant="standard"
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        inputRef={inputRef}
        type={masked ? "password" : "text"}
        InputProps={{
          disableUnderline: true,
          sx: {
            fontSize: 13,
            fontFamily: "monospace",
            ...(showOverlay
              ? { color: "transparent !important", caretColor: theme.palette.text.primary }
              : {}),
          },
        }}
      />
      {showOverlay && (
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            pointerEvents: "none",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <Box
            component="span"
            sx={{ fontFamily: "monospace", fontSize: 13, lineHeight: "normal" }}
          >
            {parseSegments(value).map((seg, i) => {
              if (seg.type === "variable") {
                const isResolved = resolvedVariables?.has(seg.variableName!);
                const color = isResolved ? varColor : unresolvedColor;
                return (
                  <Tooltip key={i} title={buildTooltip(seg.variableName!)} arrow placement="top" enterDelay={200}>
                    <Box
                      component="span"
                      sx={{
                        color,
                        fontWeight: 600,
                        backgroundColor: alpha(color, 0.12),
                        borderRadius: "3px",
                        px: "2px",
                        pointerEvents: "auto",
                        cursor: "default",
                      }}
                      onClick={(e) => { e.stopPropagation(); inputRef.current?.focus(); }}
                    >
                      {seg.text}
                    </Box>
                  </Tooltip>
                );
              }
              return (
                <Box component="span" key={i} sx={{ color: theme.palette.text.primary }}>
                  {seg.text}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Variable autocomplete dropdown */}
      {acOpen && filteredVariables.length > 0 && (
        <ClickAwayListener onClickAway={() => setAcOpen(false)}>
          <Popper
            open
            anchorEl={containerRef.current}
            placement="bottom-start"
            sx={{ zIndex: 1400, width: containerRef.current?.offsetWidth ?? 300 }}
            modifiers={[{ name: "offset", options: { offset: [0, 4] } }]}
          >
            <Paper
              elevation={8}
              sx={{
                maxHeight: 240,
                overflow: "auto",
                border: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
                borderRadius: 2,
              }}
            >
              <List dense disablePadding>
                {groupedFiltered.map((group) => [
                  <ListSubheader
                    key={`header-${group.label}`}
                    sx={{
                      bgcolor: alpha(theme.palette.primary.main, 0.06),
                      lineHeight: "28px",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {group.label}
                  </ListSubheader>,
                  ...group.items.map((item) => {
                    const flatIdx = filteredVariables.findIndex((v) => v.item === item);
                    return (
                      <ListItem
                        key={item.key}
                        component="div"
                        onClick={() => handleSelectVariable(item.key)}
                        sx={{
                          cursor: "pointer",
                          bgcolor: flatIdx === acSelectedIndex ? alpha(theme.palette.primary.main, 0.12) : "transparent",
                          "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.08) },
                          py: 0.5,
                          px: 2,
                        }}
                      >
                        <ListItemText
                          primary={
                            <Typography variant="body2" fontFamily="monospace" fontSize={13}>
                              {`{{${item.key}}}`}
                            </Typography>
                          }
                          secondary={
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {item.value.length > 50 ? item.value.slice(0, 50) + "..." : item.value}
                            </Typography>
                          }
                        />
                      </ListItem>
                    );
                  }),
                ])}
              </List>
            </Paper>
          </Popper>
        </ClickAwayListener>
      )}
    </Box>
  );
}

export default function KeyValueEditor({
  pairs,
  onChange,
  keyLabel,
  valueLabel,
  showDescription = false,
  showEnable = true,
  resolvedVariables,
  variableGroups,
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
          overflow: "visible",
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
              overflow: "visible",
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
                  <VariableValueCell
                    value={pair.key}
                    onChange={(v) => update(pair.id, "key", v)}
                    placeholder={resolvedKeyLabel}
                    resolvedVariables={resolvedVariables}
                    variableGroups={variableGroups}
                  />
                </TableCell>
                <TableCell>
                  <VariableValueCell
                    value={pair.value}
                    onChange={(v) => update(pair.id, "value", v)}
                    placeholder={resolvedValueLabel}
                    resolvedVariables={resolvedVariables}
                    variableGroups={variableGroups}
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

export { newPair, VariableValueCell };
