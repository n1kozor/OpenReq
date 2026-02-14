import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
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
  Assessment,
  CheckCircle,
  Error as ErrorIcon,
  Cancel,
  ExpandMore,
  ExpandLess,
  FileDownload,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import { runsApi } from "@/api/endpoints";
import { METHOD_COLORS, statusChipColor, formatMs } from "./runnerUtils";
import type { CollectionRunDetail, CollectionRunResultDetail } from "@/types";

interface RunReportViewProps {
  runId: string;
  open: boolean;
  onClose: () => void;
}

export default function RunReportView({ runId, open, onClose }: RunReportViewProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [report, setReport] = useState<CollectionRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIteration, setActiveIteration] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !runId) return;
    setLoading(true);
    setReport(null);
    setActiveIteration(1);
    setExpandedRows(new Set());
    runsApi
      .get(runId)
      .then((res) => setReport(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, runId]);

  const toggleRow = useCallback((key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (!open) return null;

  const iterationResults: CollectionRunResultDetail[] = report
    ? report.results.filter((r) => r.iteration === activeIteration)
    : [];

  const statusColor =
    report?.status === "completed"
      ? theme.palette.success.main
      : report?.status === "stopped"
      ? theme.palette.warning.main
      : theme.palette.error.main;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: 520,
          bgcolor: isDark ? "#0d1117" : "#fff",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
        <Assessment sx={{ color: theme.palette.primary.main }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontSize: "1rem", fontWeight: 700 }}>
            {t("runner.viewReport")}
          </Typography>
          {report && (
            <Typography variant="caption" color="text.secondary">
              {report.collection_name}
              {" — "}
              {new Date(report.created_at).toLocaleString()}
            </Typography>
          )}
        </Box>
        {report && (
          <Chip
            label={t(`runner.${report.status}`)}
            size="small"
            sx={{
              fontWeight: 700,
              fontSize: "0.7rem",
              bgcolor: alpha(statusColor, 0.12),
              color: statusColor,
              border: `1px solid ${alpha(statusColor, 0.3)}`,
            }}
          />
        )}
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && report && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {/* Meta info */}
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", fontSize: "0.8rem", color: "text.secondary" }}>
              {report.environment_name && (
                <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                  <strong>{t("runner.environment")}:</strong> {report.environment_name}
                </Typography>
              )}
              <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                <strong>{t("runner.iterations")}:</strong> {report.iterations}
              </Typography>
            </Box>

            {/* Summary chips */}
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
                value={String(report.total_requests)}
                color={theme.palette.info.main}
              />
              <SummaryChip
                label={t("runner.passedTests")}
                value={String(report.passed_tests)}
                color={theme.palette.success.main}
              />
              <SummaryChip
                label={t("runner.failedTests")}
                value={String(report.failed_tests)}
                color={report.failed_tests > 0 ? theme.palette.error.main : theme.palette.text.secondary}
              />
              {report.failed_count > 0 && (
                <SummaryChip
                  label={t("runner.errors")}
                  value={String(report.failed_count)}
                  color={theme.palette.error.main}
                />
              )}
              <SummaryChip
                label={t("runner.totalTime")}
                value={formatMs(report.total_time_ms)}
                color={theme.palette.text.secondary}
              />
            </Box>

            {/* Iteration tabs */}
            {report.iterations > 1 && (
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
                {Array.from({ length: report.iterations }, (_, i) => i + 1).map((n) => (
                  <Tab
                    key={n}
                    label={t("runner.iteration", { n })}
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
                  {iterationResults.map((item, idx) => {
                    const rowKey = `${activeIteration}-${idx}`;
                    const isExpanded = expandedRows.has(rowKey);
                    const tests = item.test_results ?? [];
                    const logs = item.console_logs ?? [];
                    const passedCount = tests.filter((t) => t.passed).length;
                    const hasDetails = tests.length > 0 || logs.length > 0 || !!item.error;

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
                              tests.length > 0 && passedCount < tests.length ? (
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
                              <Typography
                                component="span"
                                sx={{
                                  fontSize: "0.65rem",
                                  fontWeight: 700,
                                  color: METHOD_COLORS[item.method] ?? "#888",
                                  minWidth: 36,
                                }}
                              >
                                {item.method}
                              </Typography>
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
                            {item.status_code ? (
                              <Chip
                                label={item.status_code}
                                size="small"
                                color={statusChipColor(item.status_code)}
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
                                color: item.elapsed_ms != null
                                  ? item.elapsed_ms < 200
                                    ? theme.palette.success.main
                                    : item.elapsed_ms < 1000
                                    ? theme.palette.warning.main
                                    : theme.palette.error.main
                                  : "text.secondary",
                              }}
                            >
                              {item.elapsed_ms != null ? formatMs(item.elapsed_ms) : "--"}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            {tests.length > 0 ? (
                              <Chip
                                label={t("runner.testsPassed", {
                                  passed: passedCount,
                                  total: tests.length,
                                })}
                                size="small"
                                color={passedCount === tests.length ? "success" : "error"}
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

                                {tests.length > 0 && (
                                  <Box sx={{ mb: 1.5 }}>
                                    <Typography
                                      variant="caption"
                                      sx={{ fontWeight: 700, mb: 0.5, display: "block" }}
                                    >
                                      {t("runner.tests")} ({passedCount}/{tests.length})
                                    </Typography>
                                    {tests.map((test, ti) => (
                                      <Box
                                        key={ti}
                                        sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.25 }}
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
                                            color: test.passed ? "text.primary" : theme.palette.error.main,
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

                                {logs.length > 0 && (
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
                                      {logs.map((log, li) => (
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
            </TableContainer>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        {report && (
          <>
            <Button
              size="small"
              startIcon={<FileDownload />}
              onClick={() => runsApi.exportDownload(runId, "json")}
              sx={{ textTransform: "none" }}
            >
              {t("runner.exportJson")}
            </Button>
            <Button
              size="small"
              startIcon={<FileDownload />}
              onClick={() => runsApi.exportDownload(runId, "html")}
              sx={{ textTransform: "none" }}
            >
              {t("runner.exportHtml")}
            </Button>
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} sx={{ textTransform: "none" }}>
          {t("runner.close")}
        </Button>
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
