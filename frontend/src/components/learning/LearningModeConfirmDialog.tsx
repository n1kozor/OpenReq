import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Alert,
} from "@mui/material";
import { School, FiberManualRecord, Warning } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import type { Environment } from "@/types";

const ENV_COLORS: Record<string, string> = {
  LIVE: "#cf5b56",
  TEST: "#e9b84a",
  DEV: "#59a869",
};

interface LearningModeConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  environment: Environment | null;
  method: string;
  url: string;
}

export default function LearningModeConfirmDialog({
  open,
  onClose,
  onConfirm,
  environment,
  method,
  url,
}: LearningModeConfirmDialogProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const envColor = environment ? (ENV_COLORS[environment.env_type] ?? "#888") : "#888";
  const isLive = environment?.env_type === "LIVE";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          border: `1px solid ${alpha(envColor, 0.3)}`,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          pb: 1,
        }}
      >
        <School sx={{ fontSize: 24, color: theme.palette.info.main }} />
        <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
          {t("learningMode.confirmTitle")}
        </Typography>
        <Chip
          icon={<School sx={{ fontSize: 14 }} />}
          label={t("learningMode.title")}
          size="small"
          sx={{
            fontSize: "0.7rem",
            height: 22,
            fontWeight: 700,
            borderRadius: 1,
            background: `linear-gradient(135deg, ${theme.palette.info.main}, ${theme.palette.info.dark})`,
            color: "#fff",
            "& .MuiChip-icon": { color: "#fff" },
          }}
        />
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          {t("learningMode.confirmDescription")}
        </Typography>

        {/* Request info */}
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            backgroundColor: isDark ? alpha("#fff", 0.03) : alpha("#000", 0.02),
            border: `1px solid ${isDark ? alpha("#fff", 0.06) : alpha("#000", 0.06)}`,
            mb: 2,
          }}
        >
          <Typography variant="caption" color="text.secondary" fontWeight={500} sx={{ mb: 1, display: "block" }}>
            {t("learningMode.requestInfo")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Chip
              label={method}
              size="small"
              sx={{
                fontSize: "0.7rem",
                height: 20,
                fontWeight: 700,
                borderRadius: 1,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <Typography
              variant="body2"
              sx={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.8rem",
                wordBreak: "break-all",
              }}
            >
              {url || "—"}
            </Typography>
          </Box>
        </Box>

        {/* Environment info */}
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            backgroundColor: alpha(envColor, isDark ? 0.08 : 0.05),
            border: `1px solid ${alpha(envColor, 0.2)}`,
            mb: 2,
          }}
        >
          <Typography variant="caption" color="text.secondary" fontWeight={500} sx={{ mb: 1, display: "block" }}>
            {t("learningMode.targetEnvironment")}
          </Typography>
          {environment ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FiberManualRecord sx={{ fontSize: 10, color: envColor }} />
              <Typography variant="body1" fontWeight={600}>
                {environment.name}
              </Typography>
              <Chip
                label={environment.env_type}
                size="small"
                sx={{
                  fontSize: "0.65rem",
                  height: 18,
                  fontWeight: 700,
                  borderRadius: 1,
                  backgroundColor: alpha(envColor, 0.15),
                  color: envColor,
                  textTransform: "uppercase",
                }}
              />
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" fontStyle="italic">
              {t("learningMode.noEnvironment")}
            </Typography>
          )}
        </Box>

        {/* Warning for LIVE */}
        {isLive && (
          <Alert
            severity="warning"
            icon={<Warning fontSize="small" />}
            sx={{ borderRadius: 2, mb: 1 }}
          >
            <Typography variant="body2" fontWeight={500}>
              {t("learningMode.liveWarning")}
            </Typography>
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} sx={{ borderRadius: 2 }}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          sx={{
            borderRadius: 2,
            px: 3,
            ...(isLive && {
              backgroundColor: "#cf5b56",
              "&:hover": { backgroundColor: alpha("#cf5b56", 0.85) },
            }),
          }}
        >
          {t("learningMode.confirmSend")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
