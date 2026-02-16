import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Divider,
} from "@mui/material";
import { Dns, NetworkPing } from "@mui/icons-material";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { networkApi } from "@/api/endpoints";

// ── Types ──

interface DnsRecord {
  ip: string;
  family: string;
}

interface DnsResolveResponse {
  hostname: string;
  records: DnsRecord[];
  elapsed_ms: number;
}

interface PingResultItem {
  seq: number;
  time_ms: number | null;
  timeout: boolean;
}

interface PingResponse {
  hostname: string;
  resolved_ip: string | null;
  results: PingResultItem[];
  min_ms: number | null;
  avg_ms: number | null;
  max_ms: number | null;
  packet_loss_percent: number;
  elapsed_ms: number;
}

// ── DNS Resolve Modal ──

interface DnsResolveModalProps {
  open: boolean;
  onClose: () => void;
  hostname: string;
}

export function DnsResolveModal({ open, onClose, hostname }: DnsResolveModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DnsResolveResponse | null>(null);

  useEffect(() => {
    if (open && hostname) {
      setLoading(true);
      setError(null);
      setData(null);
      networkApi
        .dnsResolve(hostname)
        .then((res) => setData(res.data as DnsResolveResponse))
        .catch((err) => {
          const msg = err?.response?.data?.detail || err.message || t("network.resolveFailed");
          setError(msg);
        })
        .finally(() => setLoading(false));
    }
  }, [open, hostname, t]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Dns sx={{ color: theme.palette.info.main }} />
        {t("network.dnsTitle")}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {t("network.hostname")}
          </Typography>
          <Typography
            variant="body1"
            fontFamily="'JetBrains Mono', monospace"
            fontWeight={600}
            sx={{ mt: 0.25 }}
          >
            {hostname}
          </Typography>
        </Box>

        {loading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 3, justifyContent: "center" }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              {t("network.resolving")}
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}

        {data && !loading && (
          <>
            {data.records.length === 0 ? (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {t("network.noRecords")}
              </Alert>
            ) : (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                  {t("network.records", { count: data.records.length })}
                </Typography>
                <TableContainer
                  sx={{
                    borderRadius: 2,
                    border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
                  }}
                >
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>
                          {t("network.ipAddress")}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 100 }}>
                          {t("network.type")}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.records.map((record, i) => (
                        <TableRow key={i}>
                          <TableCell
                            sx={{
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: "0.8rem",
                            }}
                          >
                            {record.ip}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={record.family}
                              size="small"
                              color={record.family === "IPv4" ? "primary" : "secondary"}
                              sx={{ height: 22, fontSize: "0.7rem", fontWeight: 600 }}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}

            <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
              <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                {t("network.resolutionTime")}: {data.elapsed_ms.toFixed(1)} ms
              </Typography>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Ping Modal ──

interface PingModalProps {
  open: boolean;
  onClose: () => void;
  hostname: string;
}

export function PingModal({ open, onClose, hostname }: PingModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PingResponse | null>(null);

  useEffect(() => {
    if (open && hostname) {
      setLoading(true);
      setError(null);
      setData(null);
      networkApi
        .ping(hostname, 4)
        .then((res) => setData(res.data as PingResponse))
        .catch((err) => {
          const msg = err?.response?.data?.detail || err.message || t("network.pingFailed");
          setError(msg);
        })
        .finally(() => setLoading(false));
    }
  }, [open, hostname, t]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <NetworkPing sx={{ color: theme.palette.success.main }} />
        {t("network.pingTitle")}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2, display: "flex", gap: 3 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              {t("network.hostname")}
            </Typography>
            <Typography
              variant="body1"
              fontFamily="'JetBrains Mono', monospace"
              fontWeight={600}
              sx={{ mt: 0.25 }}
            >
              {hostname}
            </Typography>
          </Box>
          {data?.resolved_ip && (
            <Box>
              <Typography variant="body2" color="text.secondary">
                {t("network.resolvedIp")}
              </Typography>
              <Typography
                variant="body1"
                fontFamily="'JetBrains Mono', monospace"
                fontWeight={600}
                sx={{ mt: 0.25 }}
              >
                {data.resolved_ip}
              </Typography>
            </Box>
          )}
        </Box>

        {loading && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 3, justifyContent: "center" }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              {t("network.pinging")}
            </Typography>
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}

        {data && !loading && (
          <>
            {/* Ping results table */}
            <TableContainer
              sx={{
                borderRadius: 2,
                border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
              }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 50 }}>
                      {t("network.seq")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem" }}>
                      {t("network.time")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: "0.75rem", width: 110 }}>
                      {t("network.status")}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.results.map((r) => (
                    <TableRow key={r.seq}>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                        {r.seq}
                      </TableCell>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}>
                        {r.timeout ? "—" : `${r.time_ms?.toFixed(1)} ms`}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={r.timeout ? t("network.timeout") : t("network.ok")}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            bgcolor: r.timeout
                              ? alpha(theme.palette.error.main, 0.15)
                              : alpha(theme.palette.success.main, 0.15),
                            color: r.timeout
                              ? theme.palette.error.main
                              : theme.palette.success.main,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Statistics */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t("network.statistics")}
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 1.5,
              }}
            >
              {[
                { label: t("network.minTime"), value: data.min_ms != null ? `${data.min_ms.toFixed(1)} ms` : "—" },
                { label: t("network.avgTime"), value: data.avg_ms != null ? `${data.avg_ms.toFixed(1)} ms` : "—" },
                { label: t("network.maxTime"), value: data.max_ms != null ? `${data.max_ms.toFixed(1)} ms` : "—" },
                {
                  label: t("network.packetLoss"),
                  value: `${data.packet_loss_percent.toFixed(0)}%`,
                  color:
                    data.packet_loss_percent === 0
                      ? theme.palette.success.main
                      : data.packet_loss_percent < 50
                        ? theme.palette.warning.main
                        : theme.palette.error.main,
                },
              ].map((stat) => (
                <Box
                  key={stat.label}
                  sx={{
                    textAlign: "center",
                    p: 1,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.divider, 0.06),
                  }}
                >
                  <Typography variant="caption" color="text.secondary" display="block">
                    {stat.label}
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    fontFamily="monospace"
                    sx={{ color: (stat as { color?: string }).color ?? "text.primary" }}
                  >
                    {stat.value}
                  </Typography>
                </Box>
              ))}
            </Box>

            <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
              <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                {data.elapsed_ms.toFixed(1)} ms
              </Typography>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
