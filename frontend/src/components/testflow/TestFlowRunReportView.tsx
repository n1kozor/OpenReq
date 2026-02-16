import { useState, useEffect } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Chip, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Collapse, IconButton,
} from "@mui/material";
import { ExpandMore, ExpandLess, FileDownload } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { testFlowsApi } from "@/api/endpoints";
import type { TestFlowRunDetail, TestFlowRunResult } from "@/types";

interface TestFlowRunReportViewProps {
  runId: string | null;
  open: boolean;
  onClose: () => void;
}

export default function TestFlowRunReportView({ runId, open, onClose }: TestFlowRunReportViewProps) {
  const { t } = useTranslation();
  const [report, setReport] = useState<TestFlowRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!runId || !open) return;
    setLoading(true);
    testFlowsApi
      .getRun(runId)
      .then(({ data }) => setReport(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [runId, open]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t("testFlow.report.title")}</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : report ? (
          <>
            {/* Summary */}
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              <Chip label={`${report.total_nodes} ${t("testFlow.execution.totalNodes")}`} size="small" variant="outlined" />
              <Chip label={`${report.passed_count} ${t("testFlow.execution.passed")}`} size="small" color="success" />
              {report.failed_count > 0 && (
                <Chip label={`${report.failed_count} ${t("testFlow.execution.failed")}`} size="small" color="error" />
              )}
              {report.skipped_count > 0 && (
                <Chip label={`${report.skipped_count} ${t("testFlow.execution.skipped")}`} size="small" />
              )}
              {report.total_assertions > 0 && (
                <Chip
                  label={`${t("testFlow.execution.assertions")}: ${report.passed_assertions}/${report.total_assertions}`}
                  size="small"
                  color={report.passed_assertions === report.total_assertions ? "success" : "warning"}
                />
              )}
              <Chip
                label={report.total_time_ms < 1000 ? `${Math.round(report.total_time_ms)} ms` : `${(report.total_time_ms / 1000).toFixed(2)} s`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={report.status}
                size="small"
                color={report.status === "completed" ? "success" : report.status === "failed" ? "error" : "warning"}
              />
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {report.flow_name}
              {report.environment_name && ` | ${report.environment_name}`}
              {` | ${new Date(report.created_at).toLocaleString()}`}
            </Typography>

            {/* Results table */}
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={30} />
                    <TableCell>#</TableCell>
                    <TableCell>{t("testFlow.execution.running")}</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Label</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Time</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.results.map((r) => (
                    <ResultRow
                      key={r.id}
                      result={r}
                      expanded={expandedRows.has(r.id)}
                      onToggle={() => toggleRow(r.id)}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        ) : (
          <Typography color="text.secondary">{t("common.error")}</Typography>
        )}
      </DialogContent>
      <DialogActions>
        {report && (
          <>
            <Button
              size="small"
              startIcon={<FileDownload />}
              onClick={() => testFlowsApi.exportRun(report.id, "json")}
            >
              {t("testFlow.report.exportJson")}
            </Button>
            <Button
              size="small"
              startIcon={<FileDownload />}
              onClick={() => testFlowsApi.exportRun(report.id, "html")}
            >
              {t("testFlow.report.exportHtml")}
            </Button>
          </>
        )}
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

function ResultRow({
  result,
  expanded,
  onToggle,
}: {
  result: TestFlowRunResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusColor =
    result.status === "success" ? "#22c55e" : result.status === "error" ? "#ef4444" : "#6b7280";

  const hasDetails = result.error || result.assertion_results?.length || result.console_logs?.length;

  return (
    <>
      <TableRow hover sx={{ cursor: hasDetails ? "pointer" : "default" }} onClick={hasDetails ? onToggle : undefined}>
        <TableCell>
          {hasDetails && (
            <IconButton size="small">
              {expanded ? <ExpandLess sx={{ fontSize: 14 }} /> : <ExpandMore sx={{ fontSize: 14 }} />}
            </IconButton>
          )}
        </TableCell>
        <TableCell sx={{ fontSize: "0.75rem" }}>{result.execution_order}</TableCell>
        <TableCell sx={{ fontSize: "0.75rem" }}>
          {result.status_code ? (
            <Chip
              label={result.status_code}
              size="small"
              color={result.status_code < 300 ? "success" : result.status_code < 400 ? "warning" : "error"}
              sx={{ height: 18, fontSize: "0.65rem" }}
            />
          ) : (
            "--"
          )}
        </TableCell>
        <TableCell sx={{ fontSize: "0.75rem" }}>{result.node_type}</TableCell>
        <TableCell sx={{ fontSize: "0.75rem" }}>{result.node_label}</TableCell>
        <TableCell>
          <Typography variant="caption" sx={{ color: statusColor, fontWeight: 700 }}>
            {result.status.toUpperCase()}
          </Typography>
        </TableCell>
        <TableCell sx={{ fontSize: "0.75rem" }}>
          {result.elapsed_ms != null
            ? result.elapsed_ms < 1000
              ? `${Math.round(result.elapsed_ms)} ms`
              : `${(result.elapsed_ms / 1000).toFixed(2)} s`
            : "--"}
        </TableCell>
      </TableRow>
      {hasDetails && (
        <TableRow>
          <TableCell colSpan={7} sx={{ p: 0 }}>
            <Collapse in={expanded}>
              <Box sx={{ p: 1.5, bgcolor: "action.hover" }}>
                {result.error && (
                  <Typography variant="caption" color="error" sx={{ display: "block", mb: 1, fontFamily: "monospace" }}>
                    {result.error}
                  </Typography>
                )}
                {result.assertion_results?.map((a, i) => (
                  <Typography key={i} variant="caption" sx={{ display: "block", color: a.passed ? "#22c55e" : "#ef4444" }}>
                    {a.passed ? "\u2714" : "\u2718"} {a.name}
                    {a.error && ` — ${a.error}`}
                  </Typography>
                ))}
                {result.console_logs && result.console_logs.length > 0 && (
                  <Box sx={{ mt: 1, p: 1, bgcolor: "background.paper", borderRadius: 1, fontFamily: "monospace", fontSize: "0.7rem" }}>
                    {result.console_logs.map((log, i) => (
                      <div key={i}>{log}</div>
                    ))}
                  </Box>
                )}
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
