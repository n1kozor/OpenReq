import {
  useRef,
  useState,
  useMemo,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import {
  Box,
  TextField,
  Typography,
  Popper,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListSubheader,
  ClickAwayListener,
  InputAdornment,
} from "@mui/material";
import { alpha, useTheme, type Theme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import type { VariableGroup, VariableInfo } from "@/hooks/useVariableGroups";

export interface UrlInputHandle {
  insertVariable: (varKey: string) => void;
}

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
  offset: number;
}

function parseUrlSegments(url: string): Segment[] {
  const parts: Segment[] = [];
  const varRegex = /\{\{([^{}]+)\}\}/g;
  let lastIndex = 0;
  let match;

  while ((match = varRegex.exec(url)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        ...parseParamSegments(url.slice(lastIndex, match.index), lastIndex),
      );
    }
    parts.push({
      text: match[0],
      type: "variable",
      variableName: match[1],
      offset: match.index,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < url.length) {
    parts.push(...parseParamSegments(url.slice(lastIndex), lastIndex));
  }

  return parts;
}

function parseParamSegments(text: string, baseOffset = 0): Segment[] {
  const parts: Segment[] = [];
  const regex = /(?<!\{)\{([^{}]+)\}(?!\})/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, match.index),
        type: "text",
        offset: baseOffset + lastIndex,
      });
    }
    parts.push({
      text: match[0],
      type: "param",
      paramName: match[1],
      offset: baseOffset + match.index,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({
      text: text.slice(lastIndex),
      type: "text",
      offset: baseOffset + lastIndex,
    });
  }

  return parts;
}

const UrlInput = forwardRef<UrlInputHandle, UrlInputProps>(function UrlInput(
  {
    url,
    pathParams,
    onUrlChange,
    onSend,
    placeholder,
    endAdornment,
    variableGroups = [],
    resolvedVariables,
  },
  ref,
) {
  const theme = useTheme();
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [inlineEdit, setInlineEdit] = useState<{
    paramName: string;
    beforeUrl: string;
    removedUrl: string;
  } | null>(null);

  const lastCursorPos = useRef<number | null>(null);

  // Autocomplete state (typing {{ trigger)
  const [acOpen, setAcOpen] = useState(false);
  const [acFilter, setAcFilter] = useState("");
  const [acCursorPos, setAcCursorPos] = useState(0);
  const [acSelectedIndex, setAcSelectedIndex] = useState(0);

  // Hover-swap popover state
  const [hoverAnchor, setHoverAnchor] = useState<HTMLElement | null>(null);
  const [hoverSegment, setHoverSegment] = useState<Segment | null>(null);
  const [hoverFilter, setHoverFilter] = useState("");
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popperInsideRef = useRef(false);

  const segments = useMemo(() => parseUrlSegments(url), [url]);
  const hasHighlights = segments.some((s) => s.type !== "text");

  // Track cursor on keyup/mouseup
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const track = () => {
      lastCursorPos.current = el.selectionStart;
    };
    el.addEventListener("keyup", track);
    el.addEventListener("mouseup", track);
    return () => {
      el.removeEventListener("keyup", track);
      el.removeEventListener("mouseup", track);
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      insertVariable(varKey: string) {
        const pos = lastCursorPos.current ?? url.length;
        const token = `{{${varKey}}}`;
        const newUrl = url.slice(0, pos) + token + url.slice(pos);
        onUrlChange(newUrl);
        const newCursorPos = pos + token.length;
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        });
      },
    }),
    [url, onUrlChange],
  );

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handleScroll = () => setScrollLeft(el.scrollLeft);
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const resolvedUrl = useMemo(() => {
    const hasParams = segments.some((s) => s.type === "param");
    const hasVars = segments.some((s) => s.type === "variable");
    if (!hasParams && !hasVars) return null;

    let resolved = url;
    let anyReplaced = false;

    for (const [key, value] of Object.entries(pathParams)) {
      if (value) {
        const before = resolved;
        resolved = resolved.split(`{${key}}`).join(value);
        if (resolved !== before) anyReplaced = true;
      }
    }

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
      setTimeout(() => {
        const pos = inputRef.current?.selectionStart ?? 0;
        lastCursorPos.current = pos;
        let offset = 0;
        for (const seg of segments) {
          const end = offset + seg.text.length;
          if (seg.type === "param" && pos >= offset && pos <= end) {
            const beforeUrl = url;
            const removedUrl =
              beforeUrl.slice(0, offset) + beforeUrl.slice(end);
            setInlineEdit({
              paramName: seg.paramName!,
              beforeUrl,
              removedUrl,
            });
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
    return flatVariables.filter((v) =>
      v.item.key.toLowerCase().includes(lower),
    );
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

  // ── Hover-swap filtered variables ──
  const hoverFiltered = useMemo(() => {
    const items: { item: VariableInfo; groupLabel: string }[] = [];
    for (const g of variableGroups) {
      for (const item of g.items) {
        items.push({ item, groupLabel: t(g.label) });
      }
    }
    if (!hoverFilter) return items;
    const lower = hoverFilter.toLowerCase();
    return items.filter((v) => v.item.key.toLowerCase().includes(lower));
  }, [variableGroups, t, hoverFilter]);

  const hoverGrouped = useMemo(() => {
    const map = new Map<string, { label: string; items: VariableInfo[] }>();
    for (const { item, groupLabel } of hoverFiltered) {
      let group = map.get(groupLabel);
      if (!group) {
        group = { label: groupLabel, items: [] };
        map.set(groupLabel, group);
      }
      group.items.push(item);
    }
    return [...map.values()];
  }, [hoverFiltered]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newUrl = e.target.value;
      onUrlChange(newUrl);

      const cursorPos = e.target.selectionStart ?? newUrl.length;
      lastCursorPos.current = cursorPos;
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
      const textBefore = url.slice(0, acCursorPos);
      const match = textBefore.match(/\{\{([^{}]*)$/);
      if (!match) return;

      const insertStart = textBefore.length - match[0].length;
      const newUrl =
        url.slice(0, insertStart) + `{{${varKey}}}` + url.slice(acCursorPos);
      onUrlChange(newUrl);
      setAcOpen(false);

      const newCursorPos = insertStart + varKey.length + 4;
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      });
    },
    [url, acCursorPos, onUrlChange],
  );

  // ── Hover-swap: replace existing variable ──
  const handleSwapVariable = useCallback(
    (newVarKey: string) => {
      if (!hoverSegment) return;
      const start = hoverSegment.offset;
      const end = start + hoverSegment.text.length;
      const newUrl =
        url.slice(0, start) + `{{${newVarKey}}}` + url.slice(end);
      onUrlChange(newUrl);
      popperInsideRef.current = false;
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setHoverAnchor(null);
      setHoverSegment(null);
      setHoverFilter("");
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [hoverSegment, url, onUrlChange],
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
        setAcSelectedIndex((prev) =>
          Math.min(prev + 1, filteredVariables.length - 1),
        );
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

  // ── Hover detection via mousemove + hit-testing overlay spans ──
  const handleContainerMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Don't interfere if popup is already open and user moved to it
      if (popperInsideRef.current) return;
      if (!overlayRef.current) return;

      const { clientX, clientY } = e;
      const varSpans = overlayRef.current.querySelectorAll<HTMLElement>(
        "[data-var-seg]",
      );

      let found: HTMLElement | null = null;
      for (const span of varSpans) {
        const rect = span.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          found = span;
          break;
        }
      }

      if (found) {
        const segIdx = Number(found.dataset.varSeg);
        const seg = segments[segIdx];
        if (seg && seg.type === "variable") {
          if (hoverTimeoutRef.current) {
            clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
          }
          // Only update if different segment
          if (!hoverSegment || hoverSegment.offset !== seg.offset) {
            setHoverAnchor(found);
            setHoverSegment(seg);
            setHoverFilter("");
          }
        }
      } else if (hoverAnchor && !popperInsideRef.current) {
        // Mouse left variable area — start delayed close
        if (!hoverTimeoutRef.current) {
          hoverTimeoutRef.current = setTimeout(() => {
            if (!popperInsideRef.current) {
              setHoverAnchor(null);
              setHoverSegment(null);
              setHoverFilter("");
            }
            hoverTimeoutRef.current = null;
          }, 300);
        }
      }
    },
    [segments, hoverAnchor, hoverSegment],
  );

  const handleContainerMouseLeave = useCallback(() => {
    if (popperInsideRef.current) return;
    hoverTimeoutRef.current = setTimeout(() => {
      if (!popperInsideRef.current) {
        setHoverAnchor(null);
        setHoverSegment(null);
        setHoverFilter("");
      }
      hoverTimeoutRef.current = null;
    }, 300);
  }, []);

  const handlePopperEnter = useCallback(() => {
    popperInsideRef.current = true;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const handlePopperLeave = useCallback(() => {
    popperInsideRef.current = false;
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverAnchor(null);
      setHoverSegment(null);
      setHoverFilter("");
      hoverTimeoutRef.current = null;
    }, 200);
  }, []);

  const paramColor = theme.palette.warning.main;
  const varColor = theme.palette.info.main;
  const unresolvedColor = theme.palette.error.main;

  return (
    <Box
      sx={{ flexGrow: 1, minWidth: 0, overflow: "hidden" }}
      ref={containerRef}
    >
      <Box
        sx={{ position: "relative" }}
        onMouseMove={hasHighlights ? handleContainerMouseMove : undefined}
        onMouseLeave={hasHighlights ? handleContainerMouseLeave : undefined}
      >
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
              ...(hasHighlights
                ? {
                    position: "relative",
                    zIndex: 2,
                    backgroundColor: "transparent",
                  }
                : {}),
            },
            "& .MuiOutlinedInput-input": {
              ...(hasHighlights
                ? {
                    color: "transparent !important",
                    caretColor: theme.palette.text.primary,
                  }
                : {}),
            },
            "& .MuiOutlinedInput-notchedOutline": hasHighlights
              ? { backgroundColor: "transparent" }
              : {},
          }}
          InputProps={{
            endAdornment: endAdornment,
          }}
        />

        {/* Mirror overlay for colored segments */}
        {hasHighlights && (
          <Box
            ref={overlayRef}
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
                        backgroundColor: pathParams[seg.paramName!]
                          ? alpha(theme.palette.success.main, 0.1)
                          : alpha(paramColor, 0.12),
                        borderRadius: "3px",
                        mx: "-1px",
                        borderBottom: `2px solid ${pathParams[seg.paramName!] ? theme.palette.success.main : paramColor}`,
                      }}
                    >
                      {seg.text}
                    </Box>
                  );
                }

                if (seg.type === "variable") {
                  const isResolved = resolvedVariables?.has(seg.variableName!);
                  const color = isResolved ? varColor : unresolvedColor;
                  const isHovered =
                    hoverSegment?.offset === seg.offset;

                  return (
                    <Box
                      component="span"
                      key={i}
                      data-var-seg={i}
                      sx={{
                        color,
                        backgroundColor: isHovered
                          ? alpha(color, 0.3)
                          : alpha(color, 0.12),
                        borderRadius: "3px",
                        mx: "-1px",
                        borderBottom: `2px solid ${color}`,
                        transition: "background-color 0.15s",
                      }}
                    >
                      {seg.text}
                    </Box>
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

        {/* Variable autocomplete dropdown ({{ typing trigger) */}
        {acOpen && filteredVariables.length > 0 && (
          <ClickAwayListener onClickAway={() => setAcOpen(false)}>
            <Popper
              open
              anchorEl={containerRef.current}
              placement="bottom-start"
              sx={{
                zIndex: 1400,
                width: containerRef.current?.offsetWidth ?? 400,
              }}
              modifiers={[
                { name: "offset", options: { offset: [0, 4] } },
              ]}
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
                <VariableList
                  groups={groupedFiltered}
                  flatItems={filteredVariables}
                  selectedIndex={acSelectedIndex}
                  onSelect={(key) => handleSelectVariable(key)}
                  theme={theme}
                />
              </Paper>
            </Popper>
          </ClickAwayListener>
        )}

        {/* Hover-swap popper for existing variables */}
        {hoverAnchor && hoverSegment && flatVariables.length > 0 && (
          <Popper
            open
            anchorEl={hoverAnchor}
            placement="bottom-start"
            sx={{ zIndex: 1500 }}
            modifiers={[
              { name: "offset", options: { offset: [0, 6] } },
            ]}
          >
            <Paper
              elevation={12}
              onMouseEnter={handlePopperEnter}
              onMouseLeave={handlePopperLeave}
              sx={{
                width: 320,
                border: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              {/* Current variable header */}
              <Box
                sx={{
                  px: 1.5,
                  py: 1,
                  bgcolor: alpha(theme.palette.info.main, 0.06),
                  borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Typography
                  variant="caption"
                  fontFamily="monospace"
                  fontWeight={600}
                  sx={{ color: theme.palette.info.main }}
                >
                  {hoverSegment.text}
                </Typography>
                {resolvedVariables?.has(hoverSegment.variableName!) && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    ={" "}
                    {(() => {
                      const val = resolvedVariables.get(
                        hoverSegment.variableName!,
                      )!.value;
                      return val.length > 40
                        ? val.slice(0, 40) + "..."
                        : val;
                    })()}
                  </Typography>
                )}
              </Box>

              {/* Search input */}
              <Box sx={{ px: 1.5, py: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder={t("variable.search")}
                  value={hoverFilter}
                  onChange={(e) => setHoverFilter(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setHoverAnchor(null);
                      setHoverSegment(null);
                      setHoverFilter("");
                    }
                  }}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      fontSize: 12,
                      borderRadius: 1,
                    },
                  }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          fontSize={10}
                        >
                          {hoverFiltered.length}
                        </Typography>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>

              {/* Variable list */}
              <Box sx={{ maxHeight: 240, overflow: "auto" }}>
                <List dense disablePadding>
                  {hoverGrouped.map((group) => [
                    <ListSubheader
                      key={`hdr-${group.label}`}
                      sx={{
                        bgcolor: alpha(theme.palette.primary.main, 0.06),
                        lineHeight: "24px",
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {group.label}
                    </ListSubheader>,
                    ...group.items.map((item) => {
                      const isCurrent =
                        item.key === hoverSegment.variableName;
                      return (
                        <ListItem
                          key={item.key}
                          component="div"
                          onClick={() => handleSwapVariable(item.key)}
                          sx={{
                            cursor: "pointer",
                            bgcolor: isCurrent
                              ? alpha(theme.palette.info.main, 0.1)
                              : "transparent",
                            "&:hover": {
                              bgcolor: alpha(
                                theme.palette.primary.main,
                                0.08,
                              ),
                            },
                            py: 0.25,
                            px: 2,
                          }}
                        >
                          <ListItemText
                            primary={
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                <Typography
                                  variant="body2"
                                  fontFamily="monospace"
                                  fontSize={12}
                                  fontWeight={isCurrent ? 700 : 400}
                                  sx={{
                                    color: isCurrent
                                      ? theme.palette.info.main
                                      : theme.palette.text.primary,
                                  }}
                                >
                                  {`{{${item.key}}}`}
                                </Typography>
                                {isCurrent && (
                                  <Typography
                                    variant="caption"
                                    fontSize={9}
                                    sx={{
                                      bgcolor: alpha(
                                        theme.palette.info.main,
                                        0.15,
                                      ),
                                      color: theme.palette.info.main,
                                      px: 0.5,
                                      borderRadius: 0.5,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {t("variable.current")}
                                  </Typography>
                                )}
                              </Box>
                            }
                            secondary={
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                noWrap
                                fontSize={11}
                              >
                                {item.value.length > 50
                                  ? item.value.slice(0, 50) + "..."
                                  : item.value}
                              </Typography>
                            }
                          />
                        </ListItem>
                      );
                    }),
                  ])}
                  {hoverFiltered.length === 0 && (
                    <ListItem>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ py: 1, textAlign: "center", width: "100%" }}
                      >
                        {t("variable.noResults")}
                      </Typography>
                    </ListItem>
                  )}
                </List>
              </Box>
            </Paper>
          </Popper>
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
});

export default UrlInput;

/** Shared variable list for autocomplete dropdown */
function VariableList({
  groups,
  flatItems,
  selectedIndex,
  onSelect,
  theme,
}: {
  groups: { label: string; items: VariableInfo[] }[];
  flatItems: { item: VariableInfo; groupLabel: string }[];
  selectedIndex: number;
  onSelect: (key: string) => void;
  theme: Theme;
}) {
  return (
    <List dense disablePadding>
      {groups.map((group) => [
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
          const flatIdx = flatItems.findIndex((v) => v.item === item);
          return (
            <ListItem
              key={item.key}
              component="div"
              onClick={() => onSelect(item.key)}
              sx={{
                cursor: "pointer",
                bgcolor:
                  flatIdx === selectedIndex
                    ? alpha(theme.palette.primary.main, 0.12)
                    : "transparent",
                "&:hover": {
                  bgcolor: alpha(theme.palette.primary.main, 0.08),
                },
                py: 0.5,
                px: 2,
              }}
            >
              <ListItemText
                primary={
                  <Typography
                    variant="body2"
                    fontFamily="monospace"
                    fontSize={13}
                  >
                    {`{{${item.key}}}`}
                  </Typography>
                }
                secondary={
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                  >
                    {item.value.length > 50
                      ? item.value.slice(0, 50) + "..."
                      : item.value}
                  </Typography>
                }
              />
            </ListItem>
          );
        }),
      ])}
    </List>
  );
}
