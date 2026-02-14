import { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  CircularProgress,
  Fade,
} from "@mui/material";
import {
  Workspaces as WorkspacesIcon,
  CheckCircle,
  Login as LoginIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import { workspacesApi } from "@/api/endpoints";
import type { Workspace } from "@/types";
import NeuralGrid from "@/components/NeuralGrid";

interface WorkspaceSelectorProps {
  onComplete: () => void;
  mode: "dark" | "light";
}

export default function WorkspaceSelector({ onComplete, mode: _mode }: WorkspaceSelectorProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const logoRef = useRef<HTMLDivElement>(null);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchWorkspaces = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await workspacesApi.listAvailable();
        if (!cancelled) {
          setWorkspaces(data);
        }
      } catch {
        if (!cancelled) {
          setError(t("common.error"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchWorkspaces();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleJoin = async () => {
    if (!selectedId) return;
    setJoining(true);
    setError("");
    try {
      await workspacesApi.join(selectedId);
      setJoined(true);
      setTimeout(() => onComplete(), 1200);
    } catch {
      setError(t("common.error"));
    } finally {
      setJoining(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isDark
          ? `radial-gradient(ellipse at 20% 50%, ${alpha("#818cf8", 0.08)} 0%, transparent 50%),
             radial-gradient(ellipse at 80% 20%, ${alpha("#c084fc", 0.06)} 0%, transparent 50%),
             radial-gradient(ellipse at 50% 80%, ${alpha("#34d399", 0.04)} 0%, transparent 50%),
             #0b0e14`
          : `radial-gradient(ellipse at 20% 50%, ${alpha("#6366f1", 0.06)} 0%, transparent 50%),
             radial-gradient(ellipse at 80% 20%, ${alpha("#a855f7", 0.04)} 0%, transparent 50%),
             radial-gradient(ellipse at 50% 80%, ${alpha("#10b981", 0.03)} 0%, transparent 50%),
             #f8fafc`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Neural network grid canvas */}
      <NeuralGrid isDark={isDark} repelElementRef={logoRef} />

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo - floating above card, repels grid nodes */}
        <Box
          ref={logoRef}
          sx={{
            position: "absolute",
            bottom: "calc(100% + 48px)",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <Box
            component="img"
            src="/logo.png"
            alt="OpenReq"
            sx={{
              width: 96,
              height: 96,
              mb: 2.5,
              filter: isDark
                ? "drop-shadow(0 6px 24px rgba(129, 140, 248, 0.5)) drop-shadow(0 2px 8px rgba(192, 132, 252, 0.3))"
                : "drop-shadow(0 6px 24px rgba(99, 102, 241, 0.35)) drop-shadow(0 2px 8px rgba(168, 85, 247, 0.2))",
            }}
          />
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              letterSpacing: "-0.03em",
              background: isDark
                ? "linear-gradient(135deg, #c7d2fe 0%, #818cf8 45%, #c084fc 100%)"
                : "linear-gradient(135deg, #4338ca 0%, #6366f1 45%, #a855f7 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            OpenReq
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mt: 1,
              fontWeight: 500,
              letterSpacing: "0.02em",
              background: isDark
                ? "linear-gradient(90deg, #94a3b8 0%, #818cf8 100%)"
                : "linear-gradient(90deg, #64748b 0%, #6366f1 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {t("app.tagline")}
          </Typography>
        </Box>

        {/* Main card */}
        <Paper
          variant="outlined"
          sx={{
            p: 5,
            width: 520,
            maxWidth: "90vw",
            borderRadius: 4,
            position: "relative",
            borderColor: isDark
              ? alpha("#8b949e", 0.12)
              : alpha("#64748b", 0.12),
            backgroundColor: isDark
              ? alpha("#111620", 0.8)
              : alpha("#ffffff", 0.9),
            backdropFilter: "blur(20px) saturate(150%)",
            boxShadow: isDark
              ? `0 32px 64px ${alpha("#000", 0.4)}, 0 0 0 1px ${alpha("#8b949e", 0.08)}`
              : `0 32px 64px ${alpha("#000", 0.08)}, 0 0 0 1px ${alpha("#64748b", 0.06)}`,
          }}
        >
          {/* Joined success state */}
          {joined ? (
            <Fade in timeout={500}>
              <Box sx={{ textAlign: "center", py: 4 }}>
                <CheckCircle sx={{ fontSize: 72, color: "success.main", mb: 2 }} />
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                  {t("workspace.joinWorkspace")}
                </Typography>
              </Box>
            </Fade>
          ) : (
            <>
              {/* Header */}
              <Box sx={{ textAlign: "center", mb: 3 }}>
                <WorkspacesIcon
                  sx={{ fontSize: 48, color: "primary.main", mb: 2, opacity: 0.8 }}
                />
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                  {t("workspace.selectWorkspace")}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t("workspace.selectWorkspaceDescription")}
                </Typography>
              </Box>

              {/* Error */}
              {error && (
                <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }}>
                  {error}
                </Alert>
              )}

              {/* Loading state */}
              {loading && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    py: 6,
                    gap: 2,
                  }}
                >
                  <CircularProgress size={36} />
                  <Typography variant="body2" color="text.secondary">
                    {t("common.loading")}
                  </Typography>
                </Box>
              )}

              {/* No workspaces available */}
              {!loading && !error && workspaces.length === 0 && (
                <Box sx={{ textAlign: "center", py: 4 }}>
                  <Typography variant="body1" color="text.secondary">
                    {t("workspace.noWorkspacesAvailable")}
                  </Typography>
                </Box>
              )}

              {/* Workspace list */}
              {!loading && workspaces.length > 0 && (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.5,
                    maxHeight: 320,
                    overflowY: "auto",
                    mb: 3,
                    pr: 0.5,
                    "&::-webkit-scrollbar": {
                      width: 6,
                    },
                    "&::-webkit-scrollbar-thumb": {
                      borderRadius: 3,
                      backgroundColor: alpha(
                        isDark ? "#8b949e" : "#64748b",
                        0.3
                      ),
                    },
                  }}
                >
                  {workspaces.map((ws) => {
                    const isSelected = selectedId === ws.id;
                    return (
                      <Paper
                        key={ws.id}
                        variant="outlined"
                        onClick={() => setSelectedId(ws.id)}
                        sx={{
                          p: 2.5,
                          cursor: "pointer",
                          borderRadius: 3,
                          transition: "all 0.2s ease",
                          borderColor: isSelected
                            ? "primary.main"
                            : isDark
                              ? alpha("#8b949e", 0.15)
                              : alpha("#64748b", 0.15),
                          borderWidth: isSelected ? 2 : 1,
                          backgroundColor: isSelected
                            ? alpha(theme.palette.primary.main, 0.08)
                            : "transparent",
                          "&:hover": {
                            borderColor: "primary.main",
                            backgroundColor: alpha(
                              theme.palette.primary.main,
                              0.04
                            ),
                          },
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography
                              variant="subtitle1"
                              sx={{
                                fontWeight: isSelected ? 700 : 600,
                                color: isSelected
                                  ? "primary.main"
                                  : "text.primary",
                              }}
                            >
                              {ws.name}
                            </Typography>
                            {ws.description && (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                  mt: 0.5,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {ws.description}
                              </Typography>
                            )}
                          </Box>
                          {isSelected && (
                            <Fade in timeout={200}>
                              <CheckCircle
                                sx={{
                                  ml: 2,
                                  color: "primary.main",
                                  fontSize: 24,
                                  flexShrink: 0,
                                }}
                              />
                            </Fade>
                          )}
                        </Box>
                      </Paper>
                    );
                  })}
                </Box>
              )}

              {/* Join button */}
              {!loading && workspaces.length > 0 && (
                <Button
                  variant="contained"
                  fullWidth
                  size="large"
                  disabled={!selectedId || joining}
                  onClick={handleJoin}
                  startIcon={
                    joining ? (
                      <CircularProgress size={16} />
                    ) : (
                      <LoginIcon />
                    )
                  }
                  sx={{
                    height: 48,
                    borderRadius: 2.5,
                    fontWeight: 600,
                    fontSize: "0.95rem",
                  }}
                >
                  {joining
                    ? t("workspace.joining")
                    : t("workspace.joinWorkspace")}
                </Button>
              )}
            </>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
