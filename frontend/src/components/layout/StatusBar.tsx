import { Box, Typography, Tooltip } from "@mui/material";
import {
  Cloud,
  Lan,
  FiberManualRecord,
  Workspaces,
  School,
  Language,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { useProxyMode } from "@/hooks/useProxyMode";
import { useLearningMode } from "@/hooks/useLearningMode";
import type { Environment, Workspace } from "@/types";

declare const __APP_VERSION__: string;

const ENV_COLORS: Record<string, string> = {
  LIVE: "#cf5b56",
  TEST: "#e9b84a",
  DEV: "#59a869",
};

interface StatusBarProps {
  mode: "dark" | "light";
  username?: string;
  workspace?: Workspace | null;
  environment?: Environment | null;
  tabCount: number;
  activeTabMethod?: string;
  activeTabUrl?: string;
}

export default function StatusBar({
  mode,
  username,
  workspace,
  environment,
  tabCount,
  activeTabMethod,
  activeTabUrl,
}: StatusBarProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isDark = mode === "dark";
  const { proxyMode, setProxyMode, localAvailable, detectionComplete } = useProxyMode();
  const { learningMode } = useLearningMode();

  // Toggling INTO local mode is only valid when a local channel is detected.
  // Toggling FROM local back to server is always allowed.
  const canToggleToLocal = localAvailable;
  const canToggle = proxyMode === "local" || canToggleToLocal;
  const toggleTooltip = !canToggle && detectionComplete
    ? t("proxyMode.localNotAvailable")
    : `${proxyMode === "local" ? t("proxyMode.localDesc") : t("proxyMode.serverDesc")} — ${t("proxyMode.clickToToggle")}`;

  const segmentSx = {
    display: "flex",
    alignItems: "center",
    gap: 0.5,
    px: 0.75,
    height: "100%",
    cursor: "default",
    "&:hover": {
      backgroundColor: isDark ? "#3c3f41" : "#dcdcdc",
    },
  };

  const textSx = {
    fontSize: "0.68rem",
    lineHeight: 1,
    whiteSpace: "nowrap" as const,
  };

  const dividerSx = {
    width: 1,
    height: 14,
    backgroundColor: isDark ? "#4e5157" : "#c4c4c4",
    mx: 0.25,
    flexShrink: 0,
  };

  const langNames: Record<string, string> = {
    en: "EN",
    de: "DE",
    hu: "HU",
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        height: 22,
        minHeight: 22,
        maxHeight: 22,
        backgroundColor: isDark ? "#2b2d30" : "#e8e8e8",
        borderTop: `1px solid ${isDark ? "#1e1f22" : "#d1d1d1"}`,
        color: "text.secondary",
        flexShrink: 0,
        zIndex: theme.zIndex.drawer + 1,
        overflow: "hidden",
      }}
    >
      {/* Left side */}
      <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
        {/* Proxy mode */}
        <Tooltip title={toggleTooltip}>
          <Box
            sx={{
              ...segmentSx,
              cursor: canToggle ? "pointer" : "not-allowed",
              opacity: canToggle ? 1 : 0.6,
            }}
            onClick={() => {
              if (!canToggle) return;
              setProxyMode(proxyMode === "server" ? "local" : "server");
            }}
          >
            {proxyMode === "local" ? (
              <Lan sx={{ fontSize: 11, color: localAvailable ? theme.palette.success.main : theme.palette.error.main }} />
            ) : (
              <Cloud sx={{ fontSize: 11 }} />
            )}
            <Typography sx={textSx}>
              {t(`proxyMode.${proxyMode}`)}
            </Typography>
          </Box>
        </Tooltip>

        <Box sx={dividerSx} />

        {/* Learning mode */}
        {learningMode && (
          <>
            <Tooltip title={t("learningMode.topBarTooltip")}>
              <Box sx={{ ...segmentSx, color: theme.palette.info.main }}>
                <School sx={{ fontSize: 11 }} />
                <Typography sx={{ ...textSx, fontWeight: 600 }}>
                  {t("learningMode.title")}
                </Typography>
              </Box>
            </Tooltip>
            <Box sx={dividerSx} />
          </>
        )}

        {/* Active request info */}
        {activeTabMethod && activeTabUrl && (
          <Box sx={segmentSx}>
            <Typography sx={{ ...textSx, fontWeight: 700, color: "text.primary" }}>
              {activeTabMethod}
            </Typography>
            <Typography sx={{ ...textSx, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis" }}>
              {activeTabUrl}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Spacer */}
      <Box sx={{ flexGrow: 1 }} />

      {/* Right side */}
      <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
        {/* Tab count */}
        <Box sx={segmentSx}>
          <Typography sx={textSx}>
            {tabCount} {tabCount === 1 ? "tab" : "tabs"}
          </Typography>
        </Box>

        <Box sx={dividerSx} />

        {/* Language */}
        <Box sx={segmentSx}>
          <Language sx={{ fontSize: 11 }} />
          <Typography sx={textSx}>
            {langNames[i18n.language] ?? i18n.language.toUpperCase()}
          </Typography>
        </Box>

        <Box sx={dividerSx} />

        {/* Environment */}
        {environment ? (
          <>
            <Tooltip title={`${environment.name} (${environment.env_type})`}>
              <Box sx={segmentSx}>
                <FiberManualRecord sx={{ fontSize: 7, color: ENV_COLORS[environment.env_type] ?? "#888" }} />
                <Typography sx={{ ...textSx, fontWeight: 500 }}>
                  {environment.name}
                </Typography>
              </Box>
            </Tooltip>
            <Box sx={dividerSx} />
          </>
        ) : null}

        {/* Workspace */}
        {workspace && (
          <>
            <Box sx={segmentSx}>
              <Workspaces sx={{ fontSize: 11, color: theme.palette.primary.main }} />
              <Typography sx={{ ...textSx, fontWeight: 500 }}>
                {workspace.name}
              </Typography>
            </Box>
            <Box sx={dividerSx} />
          </>
        )}

        {/* Username */}
        {username && (
          <>
            <Box sx={segmentSx}>
              <Typography sx={textSx}>
                {username}
              </Typography>
            </Box>
            <Box sx={dividerSx} />
          </>
        )}

        {/* Version */}
        <Box sx={segmentSx}>
          <Typography sx={{ ...textSx, fontSize: "0.62rem" }}>
            v{__APP_VERSION__}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
