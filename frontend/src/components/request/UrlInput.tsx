import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import {
  Box,
  TextField,
  Typography,
  Tooltip,
  Popper,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListSubheader,
  ClickAwayListener,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import type { VariableGroup, VariableInfo } from "@/hooks/useVariableGroups";

interface UrlInputProps {
  url: string;
  pathParams: Record<string, string>;
  onUrlChange: (url: string) => void;
  onPathParamsChange: (params: Record<string, string>) => void;
  onSend: () => void;
  placeholder?: string;
  endAdornment?: React.ReactNode;
  variableGroups?: VariableGroup[];
  resolvedVariables?: Map<string, VariableInfo>;
}

type SegmentType = "text" | "param" | "variable";

interface Segment {
  text: string;
  type: SegmentType;
  paramName?: string;
  variableName?: string;
}

/**
 * Parse URL into segments of text, {param}, and {{variable}}.
 * Processes {{variable}} first, then {param} in remaining text.
 */
function parseUrlSegments(url: string): Segment[] {
  const parts: Segment[] = [];

  // First pass: split on {{variable}}
  const varRegex = /\{\{([^{}]+)\}\}/g;
  let lastIndex = 0;
  let match;

  while ((match = varRegex.exec(url)) !== null) {
    if (match.index > lastIndex) {
      // Parse remaining text for {params}
      parts.push(...parseParamSegments(url.slice(lastIndex, match.index)));
    }
    parts.push({ text: match[0], type: "variable", variableName: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < url.length) {
    parts.push(...parseParamSegments(url.slice(lastIndex)));
  }

  return parts;
}

/** Parse text for single-brace {param} segments (not {{variable}}) */
function parseParamSegments(text: string): Segment[] {
  const parts: Segment[] = [];
  const regex = /(?<!\{)\{([^{}]+)\}(?!\})/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), type: "text" });
    }
    parts.push({ text: match[0], type: "param", paramName: match[1] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), type: "text" });
  }

  return parts;
}

export default function UrlInput({
  url,
  pathParams,
  onUrlChange,
  onSend,
  placeholder,
  endAdornment,
  variableGroups = [],
  resolvedVariables,
}: UrlInputProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [inlineEdit, setInlineEdit] = useState<{
    paramName: string;
    beforeUrl: string;
    removedUrl: string;
  } | null>(null);

  // Autocomplete state
  const [acOpen, setAcOpen] = useState(false);
  const [acFilter, setAcFilter] = useState("");
  const [acCursorPos, setAcCursorPos] = useState(0);
  const [acSelectedIndex, setAcSelectedIndex] = useState(0);

  const segments = useMemo(() => parseUrlSegments(url), [url]);
  const hasHighlights = segments.some((s) => s.type !== "text");

  // Sync scroll position between input and mirror
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handleScroll = () => setScrollLeft(el.scrollLeft);
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Build resolved URL preview
  const resolvedUrl = useMemo(() => {
    const hasParams = segments.some((s) => s.type === "param");
    const hasVars = segments.some((s) => s.type === "variable");
    if (!hasParams && !hasVars) return null;

    let resolved = url;
    let anyReplaced = false;

    // Replace path params
    for (const [key, value] of Object.entries(pathParams)) {
      if (value) {
        const before = resolved;
        resolved = resolved.split(`{${key}}`).join(value);
        if (resolved !== before) anyReplaced = true;
      }
    }

    // Replace variables
    if (resolvedVariables) {
      for (const [key, info] of resolvedVariables) {
        const before = resolved;
        resolved = resolved.split(`{{${key}}}`).join(info.value);
        if (resolved !== before) anyReplaced = true;
      }
    }

    return anyReplaced ? resolved : null;
  }, [url, pathParams, resolvedVariables, segments]);

  const handleClick = useCallback(
    (_e: React.MouseEvent<HTMLDivElement>) => {
      const hasParams = segments.some((s) => s.type === "param");
      if (!hasParams) return;
      // Delay to let browser update selectionStart
      setTimeout(() => {
        const pos = inputRef.current?.selectionStart ?? 0;
        let offset = 0;
        for (const seg of segments) {
          const end = offset + seg.text.length;
          if (seg.type === "param" && pos >= offset && pos <= end) {
            const beforeUrl = url;
            const removedUrl = beforeUrl.slice(0, offset) + beforeUrl.slice(end);
            setInlineEdit({ paramName: seg.paramName!, beforeUrl, removedUrl });
            onUrlChange(removedUrl);
            requestAnimationFrame(() => {
              inputRef.current?.focus();
              inputRef.current?.setSelectionRange(offset, offset);
            });
            return;
          }
          offset = end;
        }
      }, 10);
    },
    [segments, url, onUrlChange],
  );

  // ── Autocomplete logic ──
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

  // Grouped filtered for display
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
      const newUrl = e.target.value;
      onUrlChange(newUrl);

      // Check for {{ trigger
      const cursorPos = e.target.selectionStart ?? newUrl.length;
      const textBefore = newUrl.slice(0, cursorPos);
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
    [onUrlChange],
  );

  const handleSelectVariable = useCallback(
    (varKey: string) => {
      // Find the {{ prefix and replace with {{varKey}}
      const textBefore = url.slice(0, acCursorPos);
      const match = textBefore.match(/\{\{([^{}]*)$/);
      if (!match) return;

      const insertStart = textBefore.length - match[0].length;
      const newUrl = url.slice(0, insertStart) + `{{${varKey}}}` + url.slice(acCursorPos);
      onUrlChange(newUrl);
      setAcOpen(false);

      // Set cursor after the inserted variable
      const newCursorPos = insertStart + varKey.length + 4; // {{varKey}}
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      });
    },
    [url, acCursorPos, onUrlChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !acOpen) {
        onSend();
        return;
      }

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
    [acOpen, acSelectedIndex, filteredVariables, handleSelectVariable, onSend],
  );

  const paramColor = theme.palette.warning.main;
  const varColor = theme.palette.info.main;
  const unresolvedColor = theme.palette.error.main;

  const buildTooltipContent = (varName: string) => {
    const info = resolvedVariables?.get(varName);
    if (info) {
      return (
        <Box sx={{ p: 0.5 }}>
          <Typography variant="caption" fontFamily="monospace" fontWeight={700} display="block">
            {`{{${varName}}}`}
          </Typography>
          <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
            {t("variable.value")}: <strong>{info.value.length > 60 ? info.value.slice(0, 60) + "..." : info.value}</strong>
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary">
            {t("variable.source")}: {t(info.source === "environment" ? "variable.environment" : "variable.collection")}
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
    <Box sx={{ flexGrow: 1, minWidth: 0, overflow: "hidden" }} ref={containerRef}>
      <Box sx={{ position: "relative" }}>
        <TextField
          fullWidth
          size="small"
          placeholder={placeholder}
          value={url}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          onBlur={() => {
            if (inlineEdit && url === inlineEdit.removedUrl) {
              onUrlChange(inlineEdit.beforeUrl);
            }
            if (inlineEdit) setInlineEdit(null);
          }}
          inputRef={inputRef}
          sx={{
            "& .MuiOutlinedInput-root": {
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 13,
              borderRadius: 2,
            },
            "& .MuiOutlinedInput-input": {
              ...(hasHighlights
                ? {
                    color: "transparent !important",
                    caretColor: theme.palette.text.primary,
                  }
                : {}),
            },
          }}
          InputProps={{
            endAdornment: endAdornment,
          }}
        />

        {/* Mirror overlay for colored segments */}
        {hasHighlights && (
          <Box
            aria-hidden="true"
            sx={{
              position: "absolute",
              top: "1px",
              left: "1px",
              right: endAdornment ? "44px" : "1px",
              bottom: "1px",
              display: "flex",
              alignItems: "center",
              px: "14px",
              pointerEvents: "none",
              overflow: "hidden",
              whiteSpace: "nowrap",
              zIndex: 1,
            }}
          >
            <Box
              component="span"
              sx={{
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: 13,
                lineHeight: "normal",
                transform: `translateX(-${scrollLeft}px)`,
              }}
            >
              {segments.map((seg, i) => {
                if (seg.type === "param") {
                  return (
                    <Box
                      component="span"
                      key={i}
                      sx={{
                        color: pathParams[seg.paramName!]
                          ? theme.palette.success.main
                          : paramColor,
                        fontWeight: 600,
                        backgroundColor: pathParams[seg.paramName!]
                          ? alpha(theme.palette.success.main, 0.1)
                          : alpha(paramColor, 0.12),
                        borderRadius: "3px",
                        px: "2px",
                      }}
                    >
                      {seg.text}
                    </Box>
                  );
                }

                if (seg.type === "variable") {
                  const isResolved = resolvedVariables?.has(seg.variableName!);
                  const color = isResolved ? varColor : unresolvedColor;

                  return (
                    <Tooltip
                      key={i}
                      title={buildTooltipContent(seg.variableName!)}
                      arrow
                      placement="top"
                      enterDelay={200}
                    >
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
                        onClick={(e) => {
                          // Pass click through to the input
                          e.stopPropagation();
                          inputRef.current?.focus();
                        }}
                      >
                        {seg.text}
                      </Box>
                    </Tooltip>
                  );
                }

                return (
                  <Box
                    component="span"
                    key={i}
                    sx={{ color: theme.palette.text.primary }}
                  >
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
              sx={{ zIndex: 1400, width: containerRef.current?.offsetWidth ?? 400 }}
              modifiers={[{ name: "offset", options: { offset: [0, 4] } }]}
            >
              <Paper
                elevation={8}
                sx={{
                  maxHeight: 280,
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

      {/* Resolved URL preview */}
      {resolvedUrl && (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mt: 0.5,
            px: 1,
            fontSize: "0.68rem",
            color: "text.secondary",
            fontFamily: "'JetBrains Mono', monospace",
            opacity: 0.6,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          &rarr; {resolvedUrl}
        </Typography>
      )}
    </Box>
  );
}
