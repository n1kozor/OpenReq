import { createTheme, alpha } from "@mui/material/styles";

const light = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#6366f1", light: "#818cf8", dark: "#4f46e5" },
    secondary: { main: "#a855f7", light: "#c084fc", dark: "#9333ea" },
    background: {
      default: "#f8fafc",
      paper: "#ffffff",
    },
    success: { main: "#10b981", light: "#34d399", dark: "#059669" },
    warning: { main: "#f59e0b", light: "#fbbf24", dark: "#d97706" },
    error: { main: "#ef4444", light: "#f87171", dark: "#dc2626" },
    info: { main: "#3b82f6", light: "#60a5fa", dark: "#2563eb" },
    divider: alpha("#64748b", 0.12),
    text: {
      primary: "#0f172a",
      secondary: "#64748b",
    },
    action: {
      hover: alpha("#64748b", 0.06),
      selected: alpha("#64748b", 0.1),
      focus: alpha("#6366f1", 0.12),
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
          scrollbarColor: `${alpha("#64748b", 0.25)} transparent`,
        },
        "::-webkit-scrollbar": {
          width: 6,
          height: 6,
        },
        "::-webkit-scrollbar-track": {
          background: "transparent",
        },
        "::-webkit-scrollbar-thumb": {
          background: alpha("#64748b", 0.2),
          borderRadius: 3,
          "&:hover": {
            background: alpha("#64748b", 0.35),
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
        },
        outlined: {
          borderColor: alpha("#64748b", 0.15),
          "&:hover": {
            borderColor: alpha("#64748b", 0.25),
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
          background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
          color: "#fff",
          "&:hover": {
            boxShadow: `0 4px 12px ${alpha("#6366f1", 0.35)}`,
            background: "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)",
          },
          "&:active": {
            transform: "scale(0.98)",
          },
        },
        outlined: {
          borderColor: alpha("#64748b", 0.2),
          "&:hover": {
            borderColor: "#6366f1",
            backgroundColor: alpha("#6366f1", 0.04),
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
              borderColor: alpha("#6366f1", 0.4),
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderWidth: 1.5,
              borderColor: "#6366f1",
              boxShadow: `0 0 0 3px ${alpha("#6366f1", 0.08)}`,
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
          background: "linear-gradient(90deg, #6366f1, #a855f7)",
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
          backgroundColor: "#ffffff",
          borderRight: `1px solid ${alpha("#64748b", 0.12)}`,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha("#ffffff", 0.8),
          backdropFilter: "blur(16px) saturate(180%)",
          borderBottom: `1px solid ${alpha("#64748b", 0.1)}`,
          color: "#0f172a",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
          border: `1px solid ${alpha("#64748b", 0.1)}`,
          boxShadow: `0 24px 48px ${alpha("#000", 0.12)}`,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          transition: "all 0.15s ease",
          "&:hover": {
            backgroundColor: alpha("#64748b", 0.06),
          },
          "&.Mui-selected": {
            backgroundColor: alpha("#6366f1", 0.08),
            "&:hover": {
              backgroundColor: alpha("#6366f1", 0.12),
            },
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: "#ffffff",
          border: `1px solid ${alpha("#64748b", 0.1)}`,
          borderRadius: 10,
          boxShadow: `0 16px 32px ${alpha("#000", 0.08)}`,
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
          backgroundColor: "#1e293b",
          color: "#e2e8f0",
          borderRadius: 6,
          fontSize: "0.75rem",
          boxShadow: `0 8px 16px ${alpha("#000", 0.15)}`,
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          "& .MuiSwitch-switchBase.Mui-checked": {
            color: "#6366f1",
          },
          "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
            backgroundColor: "#6366f1",
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
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: alpha("#64748b", 0.1),
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: "none",
          fontWeight: 500,
          borderColor: alpha("#64748b", 0.15),
          "&.Mui-selected": {
            backgroundColor: alpha("#6366f1", 0.1),
            color: "#4f46e5",
            borderColor: alpha("#6366f1", 0.3),
            "&:hover": {
              backgroundColor: alpha("#6366f1", 0.15),
            },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: alpha("#64748b", 0.08),
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

export default light;
