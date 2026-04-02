import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Divider,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  keys: string;
  action: string;
}

export default function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const sections: { title: string; shortcuts: ShortcutEntry[] }[] = [
    {
      title: t("shortcuts.general"),
      shortcuts: [
        { keys: "Ctrl+N", action: t("shortcuts.newRequest") },
        { keys: "Ctrl+S", action: t("shortcuts.save") },
        { keys: "Ctrl+Shift+S", action: t("shortcuts.saveAs") },
        { keys: "Ctrl+W", action: t("shortcuts.closeTab") },
        { keys: "Ctrl+,", action: t("shortcuts.openSettings") },
        { keys: "Ctrl+K", action: t("shortcuts.showShortcuts") },
        { keys: "F11", action: t("shortcuts.toggleFullScreen") },
      ],
    },
    {
      title: t("shortcuts.request"),
      shortcuts: [
        { keys: "Ctrl+Enter", action: t("shortcuts.sendRequest") },
        { keys: "Ctrl+I", action: t("shortcuts.importData") },
      ],
    },
    {
      title: t("shortcuts.navigation"),
      shortcuts: [
        { keys: "Ctrl+B", action: t("shortcuts.toggleSidebar") },
        { keys: "Ctrl+1...9", action: t("shortcuts.switchTab") },
      ],
    },
    {
      title: t("shortcuts.editor"),
      shortcuts: [
        { keys: "Ctrl+F", action: t("shortcuts.find") },
        { keys: "Ctrl+H", action: t("shortcuts.replace") },
        { keys: "Ctrl+Z", action: t("shortcuts.undo") },
        { keys: "Ctrl+Shift+Z", action: t("shortcuts.redo") },
      ],
    },
  ];

  const keySx = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 24,
    height: 22,
    px: 0.75,
    borderRadius: 0.75,
    fontSize: "0.72rem",
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    backgroundColor: isDark ? "#3c3f41" : "#e8e8e8",
    border: `1px solid ${isDark ? "#4e5157" : "#d1d1d1"}`,
    color: "text.primary",
    boxShadow: isDark ? "0 1px 0 #1e1f22" : "0 1px 0 #c4c4c4",
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {t("shortcuts.title")}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <Close sx={{ fontSize: 18 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: 3 }}>
        {sections.map((section, idx) => (
          <Box key={section.title}>
            {idx > 0 && <Divider sx={{ my: 1.5 }} />}
            <Typography
              variant="subtitle2"
              sx={{
                mb: 1,
                mt: idx > 0 ? 0.5 : 0,
                color: "text.secondary",
                textTransform: "uppercase",
                fontSize: "0.7rem",
                letterSpacing: "0.08em",
                fontWeight: 700,
              }}
            >
              {section.title}
            </Typography>
            {section.shortcuts.map((shortcut) => (
              <Box
                key={shortcut.keys}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  py: 0.5,
                  px: 0.5,
                  borderRadius: 0.5,
                  "&:hover": {
                    backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                  },
                }}
              >
                <Typography variant="body2" sx={{ fontSize: "0.82rem" }}>
                  {shortcut.action}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  {shortcut.keys.split("+").map((key, i) => (
                    <Box key={i}>
                      {i > 0 && (
                        <Typography
                          component="span"
                          sx={{ fontSize: "0.68rem", color: "text.secondary", mx: 0.25 }}
                        >
                          +
                        </Typography>
                      )}
                      <Box component="span" sx={keySx}>{key}</Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  );
}
