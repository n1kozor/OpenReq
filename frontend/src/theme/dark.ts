import { createTheme, alpha } from "@mui/material/styles";

// JetBrains Darcula-inspired dark theme
const dark = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#4a88c7", light: "#6ba5d7", dark: "#3574b2" },
    secondary: { main: "#a882c4", light: "#c4a6d8", dark: "#8b6aad" },
    background: {
      default: "#2b2d30",
      paper: "#1e1f22",
    },
    success: { main: "#59a869", light: "#6cc07a", dark: "#499c59" },
    warning: { main: "#e9b84a", light: "#f0cb6e", dark: "#d4a03a" },
    error: { main: "#cf6679", light: "#e08090", dark: "#b54c63" },
    info: { main: "#548af7", light: "#7aa3f9", dark: "#3d6fd4" },
    divider: "#4e5157",
    text: {
      primary: "#dfe1e5",
      secondary: "#9da0a8",
    },
    action: {
      hover: alpha("#dfe1e5", 0.08),
      selected: alpha("#4a88c7", 0.15),
      focus: alpha("#4a88c7", 0.2),
    },
  },
  typography: {
    fontFamily: "'JetBrains Mono', 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 13,
    h4: { fontWeight: 700, letterSpacing: "-0.02em" },
    h5: { fontWeight: 700, letterSpacing: "-0.01em" },
    h6: { fontWeight: 600, fontSize: "0.95rem", letterSpacing: "-0.01em" },
    subtitle1: { fontWeight: 600, fontSize: "0.9rem" },
    subtitle2: { fontWeight: 600, fontSize: "0.8rem", letterSpacing: "0.01em" },
    body1: { fontSize: "0.875rem", lineHeight: 1.5 },
    body2: { fontSize: "0.82rem", lineHeight: 1.4 },
    caption: { fontSize: "0.72rem", letterSpacing: "0.01em" },
    button: { textTransform: "none", fontWeight: 500, fontSize: "0.82rem", letterSpacing: "0.01em" },
  },
  shape: { borderRadius: 3 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "*, *::before, *::after": {
          transition: "background-color 0.1s ease, border-color 0.1s ease",
        },
        body: {
          scrollbarWidth: "thin",
          scrollbarColor: `${alpha("#6f737a", 0.4)} transparent`,
        },
        "::-webkit-scrollbar": { width: 8, height: 8 },
        "::-webkit-scrollbar-track": { background: "#2b2d30" },
        "::-webkit-scrollbar-thumb": {
          background: alpha("#6f737a", 0.35),
          borderRadius: 0,
          "&:hover": { background: alpha("#6f737a", 0.55) },
        },
        "@keyframes fadeIn": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        "@keyframes slideIn": {
          from: { opacity: 0, transform: "translateX(-4px)" },
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
          borderColor: "#4e5157",
        },
        outlined: {
          borderColor: "#4e5157",
          "&:hover": { borderColor: "#4a88c7" },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 3,
          padding: "4px 14px",
          fontWeight: 500,
          transition: "all 0.1s ease",
        },
        contained: {
          boxShadow: "none",
          backgroundColor: "#4a88c7",
          "&:hover": {
            boxShadow: "none",
            backgroundColor: "#5a98d7",
          },
          "&:active": { backgroundColor: "#3574b2" },
        },
        outlined: {
          borderColor: "#4e5157",
          "&:hover": {
            borderColor: "#4a88c7",
            backgroundColor: alpha("#4a88c7", 0.1),
          },
        },
        sizeSmall: { padding: "2px 10px", fontSize: "0.78rem", borderRadius: 3 },
      },
    },
    MuiTextField: {
      defaultProps: { size: "small" },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 3,
            transition: "all 0.1s ease",
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: "#4a88c7",
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderWidth: 1,
              borderColor: "#4a88c7",
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: { borderRadius: 3 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 400,
          minHeight: 34,
          fontSize: "0.82rem",
          transition: "all 0.1s ease",
          "&.Mui-selected": { fontWeight: 500 },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 2,
          borderRadius: 0,
          backgroundColor: "#4a88c7",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500, borderRadius: 3 },
        sizeSmall: { height: 20, fontSize: "0.72rem" },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#2b2d30",
          borderRight: "1px solid #393b40",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "#3c3f41",
          borderBottom: "1px solid #393b40",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: "#2b2d30",
          borderRadius: 6,
          border: "1px solid #393b40",
          boxShadow: `0 12px 40px ${alpha("#000", 0.5)}`,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          transition: "all 0.1s ease",
          "&:hover": { backgroundColor: alpha("#bcbec4", 0.08) },
          "&.Mui-selected": {
            backgroundColor: alpha("#4a88c7", 0.2),
            "&:hover": { backgroundColor: alpha("#4a88c7", 0.25) },
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: "#2b2d30",
          border: "1px solid #393b40",
          borderRadius: 4,
          boxShadow: `0 8px 24px ${alpha("#000", 0.4)}`,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          margin: 0,
          fontSize: "0.82rem",
          transition: "all 0.1s ease",
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "#4e5157",
          borderRadius: 3,
          fontSize: "0.75rem",
          border: "1px solid #4e5157",
          boxShadow: `0 4px 12px ${alpha("#000", 0.3)}`,
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          "& .MuiSwitch-switchBase.Mui-checked": { color: "#4a88c7" },
          "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: "#4a88c7" },
        },
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 3 } },
    },
    MuiSnackbar: {
      styleOverrides: {
        root: {
          "& .MuiAlert-root": { borderRadius: 3 },
        },
      },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: "#4e5157" } },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: 3,
          textTransform: "none",
          fontWeight: 500,
          borderColor: "#4e5157",
          "&.Mui-selected": {
            backgroundColor: alpha("#4a88c7", 0.2),
            color: "#6ba5d7",
            borderColor: "#4a88c7",
            "&:hover": { backgroundColor: alpha("#4a88c7", 0.25) },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderBottomColor: "#4e5157" } },
    },
    MuiBadge: {
      styleOverrides: { badge: { fontWeight: 600 } },
    },
  },
});

export default dark;
