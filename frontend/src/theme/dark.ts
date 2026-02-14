import { createTheme, alpha } from "@mui/material/styles";

const dark = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#818cf8", light: "#a5b4fc", dark: "#6366f1" },
    secondary: { main: "#c084fc", light: "#d8b4fe", dark: "#a855f7" },
    background: {
      default: "#0b0e14",
      paper: "#111620",
    },
    success: { main: "#34d399", light: "#6ee7b7", dark: "#10b981" },
    warning: { main: "#fbbf24", light: "#fcd34d", dark: "#f59e0b" },
    error: { main: "#f87171", light: "#fca5a5", dark: "#ef4444" },
    info: { main: "#60a5fa", light: "#93c5fd", dark: "#3b82f6" },
    divider: alpha("#8b949e", 0.15),
    text: {
      primary: "#e6edf3",
      secondary: "#8b949e",
    },
    action: {
      hover: alpha("#c9d1d9", 0.06),
      selected: alpha("#c9d1d9", 0.1),
      focus: alpha("#818cf8", 0.12),
    },
  },
  typography: {
    fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 13,
    h4: { fontWeight: 700, letterSpacing: "-0.02em" },
    h5: { fontWeight: 700, letterSpacing: "-0.01em" },
    h6: { fontWeight: 600, fontSize: "0.95rem", letterSpacing: "-0.01em" },
    subtitle1: { fontWeight: 600, fontSize: "0.9rem" },
    subtitle2: { fontWeight: 600, fontSize: "0.8rem", letterSpacing: "0.01em" },
    body1: { fontSize: "0.875rem", lineHeight: 1.6 },
    body2: { fontSize: "0.82rem", lineHeight: 1.5 },
    caption: { fontSize: "0.72rem", letterSpacing: "0.02em" },
    button: { textTransform: "none", fontWeight: 500, fontSize: "0.82rem", letterSpacing: "0.01em" },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "*, *::before, *::after": {
          transition: "background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
        },
        body: {
          scrollbarWidth: "thin",
          scrollbarColor: `${alpha("#8b949e", 0.3)} transparent`,
        },
        "::-webkit-scrollbar": {
          width: 6,
          height: 6,
        },
        "::-webkit-scrollbar-track": {
          background: "transparent",
        },
        "::-webkit-scrollbar-thumb": {
          background: alpha("#8b949e", 0.25),
          borderRadius: 3,
          "&:hover": {
            background: alpha("#8b949e", 0.4),
          },
        },
        "@keyframes fadeIn": {
          from: { opacity: 0, transform: "translateY(4px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        "@keyframes slideIn": {
          from: { opacity: 0, transform: "translateX(-8px)" },
          to: { opacity: 1, transform: "translateX(0)" },
        },
        "@keyframes pulse": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.6 },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          borderColor: alpha("#8b949e", 0.15),
        },
        outlined: {
          borderColor: alpha("#8b949e", 0.12),
          "&:hover": {
            borderColor: alpha("#8b949e", 0.25),
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: "6px 16px",
          fontWeight: 500,
          transition: "all 0.2s ease",
        },
        contained: {
          boxShadow: "none",
          background: "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)",
          "&:hover": {
            boxShadow: `0 4px 12px ${alpha("#818cf8", 0.4)}`,
            background: "linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%)",
          },
          "&:active": {
            transform: "scale(0.98)",
          },
        },
        outlined: {
          borderColor: alpha("#8b949e", 0.2),
          "&:hover": {
            borderColor: "#818cf8",
            backgroundColor: alpha("#818cf8", 0.08),
          },
        },
        sizeSmall: { padding: "4px 12px", fontSize: "0.78rem", borderRadius: 6 },
      },
    },
    MuiTextField: {
      defaultProps: { size: "small" },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 8,
            transition: "all 0.2s ease",
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: alpha("#818cf8", 0.4),
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderWidth: 1.5,
              borderColor: "#818cf8",
              boxShadow: `0 0 0 3px ${alpha("#818cf8", 0.1)}`,
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 500,
          minHeight: 40,
          fontSize: "0.82rem",
          transition: "all 0.2s ease",
          "&.Mui-selected": {
            fontWeight: 600,
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          borderRadius: 1,
          background: "linear-gradient(90deg, #818cf8, #c084fc)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 6,
        },
        sizeSmall: { height: 22, fontSize: "0.72rem" },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#0d1117",
          borderRight: `1px solid ${alpha("#8b949e", 0.12)}`,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha("#0b0e14", 0.8),
          backdropFilter: "blur(16px) saturate(180%)",
          borderBottom: `1px solid ${alpha("#8b949e", 0.1)}`,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: "#161b22",
          borderRadius: 12,
          border: `1px solid ${alpha("#8b949e", 0.12)}`,
          boxShadow: `0 24px 48px ${alpha("#000", 0.5)}`,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          transition: "all 0.15s ease",
          "&:hover": {
            backgroundColor: alpha("#c9d1d9", 0.06),
          },
          "&.Mui-selected": {
            backgroundColor: alpha("#818cf8", 0.12),
            "&:hover": {
              backgroundColor: alpha("#818cf8", 0.16),
            },
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: "#161b22",
          border: `1px solid ${alpha("#8b949e", 0.12)}`,
          borderRadius: 10,
          boxShadow: `0 16px 32px ${alpha("#000", 0.4)}`,
          backdropFilter: "blur(16px)",
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          margin: "2px 4px",
          fontSize: "0.82rem",
          transition: "all 0.15s ease",
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#21262d",
          borderRadius: 6,
          fontSize: "0.75rem",
          border: `1px solid ${alpha("#8b949e", 0.15)}`,
          boxShadow: `0 8px 16px ${alpha("#000", 0.3)}`,
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          "& .MuiSwitch-switchBase.Mui-checked": {
            color: "#818cf8",
          },
          "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
            backgroundColor: "#818cf8",
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiSnackbar: {
      styleOverrides: {
        root: {
          "& .MuiAlert-root": {
            borderRadius: 10,
            backdropFilter: "blur(16px)",
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: alpha("#8b949e", 0.1),
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: "none",
          fontWeight: 500,
          borderColor: alpha("#8b949e", 0.15),
          "&.Mui-selected": {
            backgroundColor: alpha("#818cf8", 0.15),
            color: "#a5b4fc",
            borderColor: alpha("#818cf8", 0.3),
            "&:hover": {
              backgroundColor: alpha("#818cf8", 0.2),
            },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: alpha("#8b949e", 0.08),
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontWeight: 600,
        },
      },
    },
  },
});

export default dark;
