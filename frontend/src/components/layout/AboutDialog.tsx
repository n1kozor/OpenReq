import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Chip,
  Divider,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";

declare const __APP_VERSION__: string;

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AboutDialog({ open, onClose }: AboutDialogProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const techStack = [
    "React 19",
    "TypeScript",
    "Material UI 7",
    "Monaco Editor",
    "Vite",
    "TanStack Query",
    "XY Flow",
    "i18next",
    "Axios",
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          overflow: "hidden",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          pt: 4,
          pb: 1,
          px: 3,
          background: isDark
            ? "linear-gradient(180deg, #1e1f22 0%, #2b2d30 100%)"
            : "linear-gradient(180deg, #ffffff 0%, #f7f8fa 100%)",
        }}
      >
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ position: "absolute", top: 8, right: 8 }}
        >
          <Close sx={{ fontSize: 18 }} />
        </IconButton>

        <Box
          component="img"
          src="/logo.png"
          alt="OpenReq"
          sx={{ width: 64, height: 64, mb: 2 }}
        />
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.25 }}>
          OpenReq
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t("about.description")}
        </Typography>
        <Chip
          label={`${t("about.version")} ${__APP_VERSION__}`}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ fontWeight: 600, fontSize: "0.78rem" }}
        />
      </Box>

      <DialogContent sx={{ px: 3, pt: 2.5, pb: 3 }}>
        <Divider sx={{ mb: 2 }} />

        <Typography variant="subtitle2" sx={{ mb: 1, color: "text.secondary", textTransform: "uppercase", fontSize: "0.7rem", letterSpacing: "0.08em" }}>
          {t("about.techStack")}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 2.5 }}>
          {techStack.map((tech) => (
            <Chip
              key={tech}
              label={tech}
              size="small"
              variant="outlined"
              sx={{ fontSize: "0.72rem", height: 22 }}
            />
          ))}
        </Box>

        <Divider sx={{ mb: 2 }} />

        <Box sx={{ textAlign: "center" }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.72rem" }}>
            {t("about.copyright")} &copy; {new Date().getFullYear()} OpenReq
          </Typography>
          <br />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.68rem" }}>
            {t("about.allRightsReserved")}
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
