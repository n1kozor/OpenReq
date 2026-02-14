import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  Chip,
} from "@mui/material";
import {
  Add,
  FolderOpen,
  FileDownload,
  AutoAwesome,
  Http,
  History,
  Cable,
  ChevronRight,
  Inventory2,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import type { Collection, CollectionItem } from "@/types";

interface DashboardProps {
  collections: Collection[];
  collectionItems: Record<string, CollectionItem[]>;
  onNewRequest: () => void;
  onNewCollection: () => void;
  onOpenImport: () => void;
  onOpenAIWizard: () => void;
  onOpenHistory: () => void;
  onOpenWebSocket: () => void;
  onOpenCollection: (collectionId: string) => void;
}

export default function Dashboard({
  collections,
  collectionItems,
  onNewRequest,
  onNewCollection,
  onOpenImport,
  onOpenAIWizard,
  onOpenHistory,
  onOpenWebSocket,
  onOpenCollection,
}: DashboardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const totalRequests = Object.values(collectionItems).reduce(
    (sum, items) => sum + items.filter((i) => !i.is_folder).length,
    0,
  );

  const quickActions = [
    {
      icon: <Add />,
      label: t("dashboard.newRequest"),
      description: t("dashboard.newRequestDesc"),
      onClick: onNewRequest,
      color: theme.palette.success.main,
    },
    {
      icon: <FolderOpen />,
      label: t("dashboard.newCollection"),
      description: t("dashboard.newCollectionDesc"),
      onClick: onNewCollection,
      color: theme.palette.primary.main,
    },
    {
      icon: <FileDownload />,
      label: t("dashboard.importData"),
      description: t("dashboard.importDataDesc"),
      onClick: onOpenImport,
      color: theme.palette.info.main,
    },
    {
      icon: <AutoAwesome />,
      label: t("dashboard.aiGenerate"),
      description: t("dashboard.aiGenerateDesc"),
      onClick: onOpenAIWizard,
      color: theme.palette.warning.main,
    },
    {
      icon: <History />,
      label: t("nav.history"),
      description: t("dashboard.historyDesc"),
      onClick: onOpenHistory,
      color: theme.palette.secondary.main,
    },
    {
      icon: <Cable />,
      label: t("websocket.title"),
      description: t("dashboard.webSocketDesc"),
      onClick: onOpenWebSocket,
      color: "#e879f9",
    },
  ];

  return (
    <Box
      sx={{
        flexGrow: 1,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        px: 3,
        py: 4,
      }}
    >
      <Box sx={{ maxWidth: 960, width: "100%" }}>
        {/* Welcome */}
        <Box sx={{ mb: 4, textAlign: "center" }}>
          <Typography
            variant="h4"
            fontWeight={700}
            sx={{
              background: isDark
                ? "linear-gradient(135deg, #e2e8f0, #94a3b8)"
                : "linear-gradient(135deg, #1e293b, #475569)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              mb: 0.5,
            }}
          >
            {t("dashboard.welcome")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("dashboard.subtitle")}
          </Typography>
        </Box>

        {/* Stats */}
        <Box sx={{ display: "flex", gap: 2, mb: 4, justifyContent: "center" }}>
          <Paper
            variant="outlined"
            sx={{
              px: 3,
              py: 2,
              borderRadius: 2,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.08 : 0.04),
              borderColor: alpha(theme.palette.primary.main, 0.2),
              minWidth: 160,
            }}
          >
            <Inventory2 sx={{ color: theme.palette.primary.main, fontSize: 28 }} />
            <Box>
              <Typography variant="h5" fontWeight={700}>
                {collections.length}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("dashboard.totalCollections")}
              </Typography>
            </Box>
          </Paper>
          <Paper
            variant="outlined"
            sx={{
              px: 3,
              py: 2,
              borderRadius: 2,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              backgroundColor: alpha(theme.palette.success.main, isDark ? 0.08 : 0.04),
              borderColor: alpha(theme.palette.success.main, 0.2),
              minWidth: 160,
            }}
          >
            <Http sx={{ color: theme.palette.success.main, fontSize: 28 }} />
            <Box>
              <Typography variant="h5" fontWeight={700}>
                {totalRequests}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("dashboard.totalRequests")}
              </Typography>
            </Box>
          </Paper>
        </Box>

        {/* Quick Actions */}
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          {t("dashboard.quickActions")}
        </Typography>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          {quickActions.map((action) => (
            <Grid key={action.label} size={{ xs: 12, sm: 6, md: 4 }}>
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  backgroundColor: alpha(action.color, isDark ? 0.04 : 0.02),
                  borderColor: alpha(action.color, 0.12),
                  "&:hover": {
                    backgroundColor: alpha(action.color, isDark ? 0.1 : 0.06),
                    borderColor: alpha(action.color, 0.3),
                    transform: "translateY(-1px)",
                    boxShadow: `0 4px 12px ${alpha(action.color, 0.15)}`,
                  },
                }}
                onClick={action.onClick}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: alpha(action.color, 0.12),
                      color: action.color,
                    }}
                  >
                    {action.icon}
                  </Box>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {action.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {action.description}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>

        {/* Recent Collections */}
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          {t("dashboard.recentCollections")}
        </Typography>
        {collections.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{
              p: 4,
              borderRadius: 2,
              textAlign: "center",
              borderStyle: "dashed",
            }}
          >
            <FolderOpen sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              {t("dashboard.noCollections")}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Add />}
              onClick={onNewCollection}
              sx={{ mt: 2, textTransform: "none" }}
            >
              {t("dashboard.newCollection")}
            </Button>
          </Paper>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {collections.slice(0, 8).map((col) => (
              <Paper
                key={col.id}
                variant="outlined"
                sx={{
                  px: 2,
                  py: 1.5,
                  borderRadius: 2,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  transition: "all 0.15s ease",
                  "&:hover": {
                    backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.06 : 0.03),
                    borderColor: alpha(theme.palette.primary.main, 0.2),
                  },
                }}
                onClick={() => onOpenCollection(col.id)}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0, overflow: "hidden", flex: 1 }}>
                  <FolderOpen sx={{ fontSize: 20, color: theme.palette.primary.main, flexShrink: 0 }} />
                  <Box sx={{ minWidth: 0, overflow: "hidden" }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {col.name}
                    </Typography>
                    {col.description && (
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                        {col.description}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                  <Chip
                    label={col.visibility === "private" ? t("collection.private") : t("collection.shared")}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: "0.65rem", height: 20 }}
                  />
                  <ChevronRight sx={{ fontSize: 18, color: "text.disabled" }} />
                </Box>
              </Paper>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}
