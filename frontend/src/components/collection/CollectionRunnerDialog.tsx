import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Collapse,
  IconButton,
  Tabs,
  Tab,
  Paper,
  CircularProgress,
} from "@mui/material";
import {
  PlayArrow,
  Stop,
  CheckCircle,
  Error as ErrorIcon,
  Cancel,
  ExpandMore,
  ExpandLess,
  FileDownload,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import { API_URL } from "@/api/client";
import { runsApi } from "@/api/endpoints";
import { METHOD_COLORS, statusChipColor, formatMs } from "./runnerUtils";
import type {
  Environment,
  CollectionRunResultItem,
} from "@/types";

interface RunSummary {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalTimeMs: number;
  avgTimeMs: number;
}

function computeSummary(results: CollectionRunResultItem[]): RunSummary {
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  let totalTimeMs = 0;
  let successCount = 0;
  let errorCount = 0;

  for (const r of results) {
    if (r.status === "success" && r.response) {
      successCount++;
      totalTimeMs += r.response.elapsed_ms;
      const pre = r.response.pre_request_result?.test_results ?? [];
      const post = r.response.script_result?.test_results ?? [];
      const all = [...pre, ...post];
      totalTests += all.length;
      passedTests += all.filter((t) => t.passed).length;
      failedTests += all.filter((t) => !t.passed).length;
    } else {
      errorCount++;
    }
  }

  return {
    totalRequests: results.length,
    successCount,
    errorCount,
    totalTests,
    passedTests,
    failedTests,
    totalTimeMs,
    avgTimeMs: successCount > 0 ? totalTimeMs / successCount : 0,
  };
}

interface CollectionRunnerDialogProps {
  open: boolean;
  onClose: () => void;
  collectionId: string;
  collectionName: string;
  environments: Environment[];
  selectedEnvId: string | null;
  onVariablesChanged?: () => void;
}

type Phase = "config" | "running" | "done";

export default function CollectionRunnerDialog({
  open,
  onClose,
  collectionId,
  collectionName,
  environments,
  selectedEnvId,
  onVariablesChanged,
}: CollectionRunnerDialogProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [phase, setPhase] = useState<Phase>("config");
  const [iterations, setIterations] = useState(1);
  const [delayMs, setDelayMs] = useState(0);
  const [envId, setEnvId] = useState<string | null>(selectedEnvId);

  // Streaming state
  const [totalCount, setTotalCount] = useState(0);
  const [currentIteration, setCurrentIteration] = useState(1);
  const [totalIterations, setTotalIterations] = useState(1);
  // Results per iteration: Map<iterationNumber, results[]>
  const [iterationResultsMap, setIterationResultsMap] = useState<Map<number, CollectionRunResultItem[]>>(new Map());
  const [activeIteration, setActiveIteration] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [wasStopped, setWasStopped] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const tableEndRef = useRef<HTMLDivElement | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPhase("config");
      setIterations(1);
      setDelayMs(0);
      setEnvId(selectedEnvId);
      setTotalCount(0);
      setCurrentIteration(1);
      setTotalIterations(1);
      setIterationResultsMap(new Map());
      setActiveIteration(1);
      setExpandedRows(new Set());
      setErrorMsg(null);
      setSavedRunId(null);
      setSaving(false);
      setWasStopped(false);
    }
  }, [open, selectedEnvId]);

  // Auto-scroll to latest result
  useEffect(() => {
    if (phase === "running" && tableEndRef.current) {
      tableEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [iterationResultsMap, phase]);

  // Auto-save when run completes
  useEffect(() => {
    if (phase !== "done" || savedRunId || saving) return;
    if (iterationResultsMap.size === 0) return;

    const allResults: CollectionRunResultItem[] = [];
    iterationResultsMap.forEach((items) => allResults.push(...items));
    if (allResults.length === 0) return;

    let totalTests = 0, passedTests = 0, failedTests = 0;
    let passedCount = 0, failedCount = 0, totalTimeMs = 0;

    const saveResults = allResults.map((item, idx) => {
      const pre = item.response?.pre_request_result?.test_results ?? [];
      const post = item.response?.script_result?.test_results ?? [];
      const tests = [...pre, ...post];
      const preLogs = item.response?.pre_request_result?.logs ?? [];
      const postLogs = item.response?.script_result?.logs ?? [];

      totalTests += tests.length;
      passedTests += tests.filter((t) => t.passed).length;
      failedTests += tests.filter((t) => !t.passed).length;

      if (item.status === "success") {
        passedCount++;
        totalTimeMs += item.response?.elapsed_ms ?? 0;
      } else {
        failedCount++;
      }

      // Find iteration for this item
      let itemIteration = 1;
      iterationResultsMap.forEach((items, iter) => {
        if (items.includes(item)) itemIteration = iter;
      });

      const body = item.response?.body;
      const isBinary = item.response?.is_binary;

      return {
        iteration: itemIteration,
        sort_index: idx,
        item_id: item.item_id,
        request_name: item.request_name,
        method: item.method,
        status: item.status,
        error: item.error ?? null,
        status_code: item.response?.status_code ?? null,
        elapsed_ms: item.response?.elapsed_ms ?? null,
        size_bytes: item.response?.size_bytes ?? null,
        response_headers: item.response?.headers ?? null,
        response_body: body && !isBinary ? body.slice(0, 50000) : null,
        test_results: tests.length > 0 ? tests : null,
        console_logs: [...preLogs, ...postLogs].length > 0 ? [...preLogs, ...postLogs] : null,
      };
    });

    const envName = envId ? environments.find((e) => e.id === envId)?.name ?? null : null;

    setSaving(true);
    runsApi
      .save({
        collection_id: collectionId,
        collection_name: collectionName,
        environment_id: envId,
        environment_name: envName,
        iterations,
        delay_ms: delayMs,
        status: wasStopped ? "stopped" : "completed",
        total_requests: allResults.length,
        passed_count: passedCount,
        failed_count: failedCount,
        total_tests: totalTests,
        passed_tests: passedTests,
        failed_tests: failedTests,
        total_time_ms: totalTimeMs,
        results: saveResults,
      })
      .then((res) => {
        setSavedRunId(res.data.id);
      })
      .catch(() => {
        // silently fail - report saving is non-critical
      })
      .finally(() => setSaving(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleRun = useCallback(async () => {
    setPhase("running");
    setErrorMsg(null);
    setIterationResultsMap(new Map());
    setActiveIteration(1);

    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams();
    if (envId) params.set("environment_id", envId);
    params.set("iterations", String(iterations));
    params.set("delay_ms", String(delayMs));

    const token = localStorage.getItem("openreq-token");
    let hadVariableChanges = false;

    try {
      const response = await fetch(
        `${API_URL}/api/v1/proxy/run/${collectionId}?${params.toString()}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const text = await response.text();
        setErrorMsg(text || `HTTP ${response.status}`);
        setPhase("config");
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setPhase("done");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "start") {
              setTotalCount(event.total);
              setCurrentIteration(event.iteration);
              setTotalIterations(event.totalIterations);
              setActiveIteration(event.iteration);
              // Initialize empty array for this iteration
              setIterationResultsMap((prev) => {
                const next = new Map(prev);
                if (!next.has(event.iteration)) next.set(event.iteration, []);
                return next;
              });
            } else if (event.type === "result") {
              const resultItem: CollectionRunResultItem = {
                item_id: event.item_id,
                request_name: event.request_name,
                method: event.method,
                status: event.status,
                error: event.error,
                response: event.response,
              };
              setIterationResultsMap((prev) => {
                const next = new Map(prev);
                const arr = [...(next.get(event.iteration) || []), resultItem];
                next.set(event.iteration, arr);
                return next;
              });
              // Track if any script modified persisted variables
              if (!hadVariableChanges && event.response) {
                const sr = [event.response.pre_request_result, event.response.script_result];
                for (const r of sr) {
                  if (!r) continue;
                  if ((r.globals_updates && Object.keys(r.globals_updates).length > 0) ||
                      (r.environment_updates && Object.keys(r.environment_updates).length > 0) ||
                      (r.collection_var_updates && Object.keys(r.collection_var_updates).length > 0)) {
                    hadVariableChanges = true;
                  }
                }
              }
            } else if (event.type === "done") {
              setPhase("done");
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      // If stream ended without explicit "done" event
      setPhase("done");
    } catch (err: any) {
      if (err?.name === "AbortError") {
        setPhase("done");
        if (hadVariableChanges) onVariablesChanged?.();
        return;
      }
      setErrorMsg(err?.message ?? String(err));
      setPhase("config");
    }
    if (hadVariableChanges) onVariablesChanged?.();
  }, [collectionId, envId, iterations, delayMs, onVariablesChanged]);

  const handleStop = useCallback(() => {
    setWasStopped(true);
    abortRef.current?.abort();
  }, []);

  const toggleRow = useCallback((key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const currentResults = iterationResultsMap.get(activeIteration) ?? [];
  const completedCount = currentResults.length;
  const summary = useMemo(() => computeSummary(currentResults), [currentResults]);
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const isRunning = phase === "running";
  const showResults = phase === "running" || phase === "done";

  return (
    <Dialog
      open={open}
      onClose={isRunning ? undefined : onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: showResults ? 520 : undefined,
          bgcolor: isDark ? "#0d1117" : "#fff",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
        <PlayArrow sx={{ color: theme.palette.primary.main }} />
        <Box>
          <Typography variant="h6" sx={{ fontSize: "1rem", fontWeight: 700 }}>
            {t("runner.title")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {collectionName}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {/* ── Config Phase ── */}
        {phase === "config" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, py: 1 }}>
            {errorMsg && (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: alpha(theme.palette.error.main, 0.08),
                  border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
                }}
              >
                <Typography variant="body2" color="error">
                  {t("runner.runFailed")}: {errorMsg}
                </Typography>
              </Box>
            )}

            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField
                label={t("runner.iterations")}
                helperText={t("runner.iterationsHint")}
                type="number"
                size="small"
                value={iterations}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1 && v <= 100) setIterations(v);
                }}
                inputProps={{ min: 1, max: 100 }}
                sx={{ width: 160 }}
              />
              <TextField
                label={t("runner.delay")}
                helperText={t("runner.delayHint")}
                type="number"
                size="small"
                value={delayMs}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 0 && v <= 60000) setDelayMs(v);
                }}
                inputProps={{ min: 0, max: 60000 }}
                sx={{ width: 160 }}
              />
            </Box>

            <FormControl size="small" sx={{ maxWidth: 300 }}>
              <InputLabel>{t("runner.environment")}</InputLabel>
              <Select
                value={envId ?? "__none__"}
                label={t("runner.environment")}
                onChange={(e) => setEnvId(e.target.value === "__none__" ? null : e.target.value)}
              >
                <MenuItem value="__none__">
                  <em>{t("runner.noEnvironment")}</em>
                </MenuItem>
                {environments.map((env) => (
                  <MenuItem key={env.id} value={env.id}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Chip
                        label={env.env_type}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: 10,
                          fontWeight: 700,
                          bgcolor:
                            env.env_type === "LIVE"
                              ? "#ef4444"
                              : env.env_type === "TEST"
                              ? "#f59e0b"
                              : "#10b981",
                          color: "#fff",
                        }}
                      />
                      {env.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}

        {/* ── Running / Results ── */}
        {showResults && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {/* Progress bar */}
            {isRunning && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    {t("runner.runningProgress", {
                      current: completedCount,
                      total: totalCount || "?",
                    })}
                  </Typography>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<Stop sx={{ fontSize: 14 }} />}
                    onClick={handleStop}
                    sx={{ textTransform: "none", fontSize: "0.75rem" }}
                  >
                    {t("runner.stop")}
                  </Button>
                </Box>
                <LinearProgress
                  variant={totalCount > 0 ? "determinate" : "indeterminate"}
                  value={progressPercent}
                  sx={{ borderRadius: 1, height: 6 }}
                />
              </Box>
            )}

            {/* Summary bar (shown once done, or partially while running) */}
            {completedCount > 0 && (
              <Box
                sx={{
                  display: "flex",
                  gap: 1.5,
                  flexWrap: "wrap",
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: isDark ? alpha("#161b22", 0.8) : alpha("#f8fafc", 0.9),
                  border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.1)}`,
                }}
              >
                <SummaryChip
                  label={t("runner.totalRequests")}
                  value={String(summary.totalRequests)}
                  color={theme.palette.info.main}
                />
                {summary.totalTests > 0 && (
                  <>
                    <SummaryChip
                      label={t("runner.passedTests")}
                      value={String(summary.passedTests)}
                      color={theme.palette.success.main}
                    />
                    <SummaryChip
                      label={t("runner.failedTests")}
                      value={String(summary.failedTests)}
                      color={summary.failedTests > 0 ? theme.palette.error.main : theme.palette.text.secondary}
                    />
                  </>
                )}
                {summary.errorCount > 0 && (
                  <SummaryChip
                    label={t("runner.errors")}
                    value={String(summary.errorCount)}
                    color={theme.palette.error.main}
                  />
                )}
                <SummaryChip
                  label={t("runner.avgTime")}
                  value={formatMs(summary.avgTimeMs)}
                  color={theme.palette.warning.main}
                />
                <SummaryChip
                  label={t("runner.totalTime")}
                  value={formatMs(summary.totalTimeMs)}
                  color={theme.palette.text.secondary}
                />
              </Box>
            )}

            {/* Iteration tabs */}
            {totalIterations > 1 && (
              <Tabs
                value={activeIteration - 1}
                onChange={(_, v) => {
                  setActiveIteration(v + 1);
                  setExpandedRows(new Set());
                }}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ minHeight: 36 }}
              >
                {Array.from({ length: totalIterations }, (_, i) => i + 1).map((n) => (
                  <Tab
                    key={n}
                    label={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        {t("runner.iteration", { n })}
                        {n === currentIteration && isRunning && (
                          <Box
                            sx={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              bgcolor: theme.palette.primary.main,
                              animation: "pulse 1s infinite",
                              "@keyframes pulse": {
                                "0%, 100%": { opacity: 1 },
                                "50%": { opacity: 0.3 },
                              },
                            }}
                          />
                        )}
                      </Box>
                    }
                    sx={{ minHeight: 36, py: 0, fontSize: "0.78rem" }}
                  />
                ))}
              </Tabs>
            )}

            {/* Results table */}
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{
                maxHeight: 360,
                bgcolor: "transparent",
                borderColor: alpha(isDark ? "#8b949e" : "#64748b", 0.1),
              }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 32, p: 0.5 }} />
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 40 }} />
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>
                      {t("runner.requestName")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 80 }}>
                      {t("runner.statusCode")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 90 }}>
                      {t("runner.responseTime")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 120 }}>
                      {t("runner.tests")}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {currentResults.map((item, idx) => {
                    const rowKey = `${activeIteration}-${idx}`;
                    const isExpanded = expandedRows.has(rowKey);
                    const preTests = item.response?.pre_request_result?.test_results ?? [];
                    const postTests = item.response?.script_result?.test_results ?? [];
                    const allTests = [...preTests, ...postTests];
                    const preLogs = item.response?.pre_request_result?.logs ?? [];
                    const postLogs = item.response?.script_result?.logs ?? [];
                    const allLogs = [...preLogs, ...postLogs];
                    const passedCount = allTests.filter((t) => t.passed).length;
                    const hasDetails = allTests.length > 0 || allLogs.length > 0 || !!item.error;
                    const method = item.method ?? "";

                    return (
                      <TableRowGroup key={rowKey}>
                        <TableRow
                          hover
                          sx={{
                            cursor: hasDetails ? "pointer" : "default",
                            "&:hover": { bgcolor: "action.hover" },
                          }}
                          onClick={() => hasDetails && toggleRow(rowKey)}
                        >
                          <TableCell sx={{ p: 0.5, width: 32 }}>
                            {hasDetails && (
                              <IconButton size="small" sx={{ width: 24, height: 24 }}>
                                {isExpanded ? (
                                  <ExpandLess sx={{ fontSize: 16 }} />
                                ) : (
                                  <ExpandMore sx={{ fontSize: 16 }} />
                                )}
                              </IconButton>
                            )}
                          </TableCell>

                          <TableCell sx={{ p: 0.5, width: 40 }}>
                            {item.status === "success" ? (
                              allTests.length > 0 && passedCount < allTests.length ? (
                                <Cancel sx={{ fontSize: 16, color: theme.palette.error.main }} />
                              ) : (
                                <CheckCircle sx={{ fontSize: 16, color: theme.palette.success.main }} />
                              )
                            ) : (
                              <ErrorIcon sx={{ fontSize: 16, color: theme.palette.error.main }} />
                            )}
                          </TableCell>

                          <TableCell>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              {method && (
                                <Typography
                                  component="span"
                                  sx={{
                                    fontSize: "0.65rem",
                                    fontWeight: 700,
                                    color: METHOD_COLORS[method] ?? "#888",
                                    minWidth: 36,
                                  }}
                                >
                                  {method}
                                </Typography>
                              )}
                              <Typography
                                variant="body2"
                                sx={{
                                  fontSize: "0.8rem",
                                  fontWeight: 500,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {item.request_name}
                              </Typography>
                            </Box>
                          </TableCell>

                          <TableCell>
                            {item.response ? (
                              <Chip
                                label={item.response.status_code}
                                size="small"
                                color={statusChipColor(item.response.status_code)}
                                sx={{
                                  height: 20,
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  borderRadius: 1,
                                }}
                              />
                            ) : (
                              <Typography variant="caption" color="error">
                                ERR
                              </Typography>
                            )}
                          </TableCell>

                          <TableCell>
                            <Typography
                              variant="caption"
                              sx={{
                                fontFamily: "monospace",
                                fontSize: "0.72rem",
                                color: item.response
                                  ? item.response.elapsed_ms < 200
                                    ? theme.palette.success.main
                                    : item.response.elapsed_ms < 1000
                                    ? theme.palette.warning.main
                                    : theme.palette.error.main
                                  : "text.secondary",
                              }}
                            >
                              {item.response ? formatMs(item.response.elapsed_ms) : "--"}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            {allTests.length > 0 ? (
                              <Chip
                                label={t("runner.testsPassed", {
                                  passed: passedCount,
                                  total: allTests.length,
                                })}
                                size="small"
                                color={passedCount === allTests.length ? "success" : "error"}
                                variant="outlined"
                                sx={{ height: 20, fontSize: "0.68rem", borderRadius: 1 }}
                              />
                            ) : (
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                                {t("runner.noTests")}
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Expanded details */}
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            sx={{ p: 0, borderBottom: isExpanded ? undefined : "none" }}
                          >
                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                              <Box
                                sx={{
                                  px: 3,
                                  py: 1.5,
                                  bgcolor: isDark ? alpha("#161b22", 0.5) : alpha("#f1f5f9", 0.5),
                                }}
                              >
                                {item.error && (
                                  <Box sx={{ mb: 1.5 }}>
                                    <Typography
                                      variant="caption"
                                      sx={{ fontWeight: 700, color: theme.palette.error.main }}
                                    >
                                      {t("runner.errorDetails")}
                                    </Typography>
                                    <Typography
                                      variant="body2"
                                      sx={{
                                        fontFamily: "monospace",
                                        fontSize: "0.78rem",
                                        color: theme.palette.error.main,
                                        mt: 0.5,
                                      }}
                                    >
                                      {item.error}
                                    </Typography>
                                  </Box>
                                )}

                                {allTests.length > 0 && (
                                  <Box sx={{ mb: 1.5 }}>
                                    <Typography
                                      variant="caption"
                                      sx={{ fontWeight: 700, mb: 0.5, display: "block" }}
                                    >
                                      {t("runner.tests")} ({passedCount}/{allTests.length})
                                    </Typography>
                                    {allTests.map((test, ti) => (
                                      <Box
                                        key={ti}
                                        sx={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 1,
                                          py: 0.25,
                                        }}
                                      >
                                        {test.passed ? (
                                          <CheckCircle
                                            sx={{ fontSize: 14, color: theme.palette.success.main }}
                                          />
                                        ) : (
                                          <Cancel
                                            sx={{ fontSize: 14, color: theme.palette.error.main }}
                                          />
                                        )}
                                        <Typography
                                          variant="body2"
                                          sx={{
                                            fontSize: "0.78rem",
                                            color: test.passed
                                              ? "text.primary"
                                              : theme.palette.error.main,
                                          }}
                                        >
                                          {test.name}
                                        </Typography>
                                        {test.error && (
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              color: theme.palette.error.main,
                                              fontFamily: "monospace",
                                              ml: 1,
                                            }}
                                          >
                                            {test.error}
                                          </Typography>
                                        )}
                                      </Box>
                                    ))}
                                  </Box>
                                )}

                                {allLogs.length > 0 && (
                                  <Box>
                                    <Typography
                                      variant="caption"
                                      sx={{ fontWeight: 700, mb: 0.5, display: "block" }}
                                    >
                                      {t("runner.consoleLogs")}
                                    </Typography>
                                    <Box
                                      sx={{
                                        fontFamily: "monospace",
                                        fontSize: "0.72rem",
                                        bgcolor: isDark ? "#0d1117" : "#f8fafc",
                                        border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.15)}`,
                                        borderRadius: 1,
                                        p: 1,
                                        maxHeight: 120,
                                        overflow: "auto",
                                      }}
                                    >
                                      {allLogs.map((log, li) => (
                                        <Box key={li} sx={{ color: "text.secondary" }}>
                                          {log}
                                        </Box>
                                      ))}
                                    </Box>
                                  </Box>
                                )}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </TableRowGroup>
                    );
                  })}
                </TableBody>
              </Table>
              {/* Scroll anchor */}
              <div ref={tableEndRef} />
            </TableContainer>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        {phase === "config" && (
          <>
            <Button onClick={onClose} sx={{ textTransform: "none" }}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="contained"
              startIcon={<PlayArrow />}
              onClick={handleRun}
              sx={{ textTransform: "none" }}
            >
              {t("runner.run")}
            </Button>
          </>
        )}
        {phase === "done" && (
          <>
            {saving && <CircularProgress size={18} sx={{ mr: 1 }} />}
            {savedRunId && (
              <Chip
                icon={<CheckCircle />}
                label={t("runner.reportSaved")}
                color="success"
                size="small"
                variant="outlined"
                sx={{ mr: 0.5 }}
              />
            )}
            <Button
              size="small"
              startIcon={<FileDownload />}
              onClick={() => savedRunId && runsApi.exportDownload(savedRunId, "json")}
              disabled={!savedRunId}
              sx={{ textTransform: "none" }}
            >
              {t("runner.exportJson")}
            </Button>
            <Button
              size="small"
              startIcon={<FileDownload />}
              onClick={() => savedRunId && runsApi.exportDownload(savedRunId, "html")}
              disabled={!savedRunId}
              sx={{ textTransform: "none" }}
            >
              {t("runner.exportHtml")}
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button onClick={onClose} sx={{ textTransform: "none" }}>
              {t("runner.close")}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

/* ── Helper sub-components ── */

function SummaryChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        px: 1.5,
        py: 0.5,
        borderRadius: 1.5,
        bgcolor: alpha(color, 0.08),
        minWidth: 64,
      }}
    >
      <Typography
        sx={{ fontSize: "1rem", fontWeight: 700, color, lineHeight: 1.2 }}
      >
        {value}
      </Typography>
      <Typography
        variant="caption"
        sx={{ fontSize: "0.62rem", color: alpha(color, 0.8), fontWeight: 600, textTransform: "uppercase" }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function TableRowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
