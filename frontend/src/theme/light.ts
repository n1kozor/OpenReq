import { createTheme, alpha } from "@mui/material/styles";

// JetBrains IntelliJ Light-inspired theme
const light = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#2675bf", light: "#4a93d4", dark: "#1a5fa0" },
    secondary: { main: "#9876aa", light: "#b299c0", dark: "#7a5d8e" },
    background: {
      default: "#f7f8fa",
      paper: "#ffffff",
    },
    success: { main: "#59a869", light: "#6cc07a", dark: "#499c59" },
    warning: { main: "#d4a03a", light: "#e9b84a", dark: "#b88a2e" },
    error: { main: "#cf5b56", light: "#e07370", dark: "#b54542" },
    info: { main: "#2675bf", light: "#4a93d4", dark: "#1a5fa0" },
    divider: "#d1d1d1",
    text: {
      primary: "#000000",
      secondary: "#5a5a5a",
    },
    action: {
      hover: alpha("#000000", 0.04),
      selected: alpha("#2675bf", 0.1),
      focus: alpha("#2675bf", 0.15),
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
          scrollbarColor: `${alpha("#6e6e6e", 0.3)} transparent`,
        },
        "::-webkit-scrollbar": { width: 8, height: 8 },
        "::-webkit-scrollbar-track": { background: "#f7f8fa" },
        "::-webkit-scrollbar-thumb": {
          background: alpha("#6e6e6e", 0.25),
          borderRadius: 0,
          "&:hover": { background: alpha("#6e6e6e", 0.4) },
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
        root: { backgroundImage: "none" },
        outlined: {
          borderColor: "#d1d1d1",
          "&:hover": { borderColor: "#2675bf" },
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
          backgroundColor: "#2675bf",
          color: "#ffffff",
          "&:hover": {
            boxShadow: "none",
            backgroundColor: "#1a5fa0",
          },
          "&:active": { backgroundColor: "#154d85" },
        },
        outlined: {
          borderColor: "#d1d1d1",
          "&:hover": {
            borderColor: "#2675bf",
            backgroundColor: alpha("#2675bf", 0.04),
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
              borderColor: "#2675bf",
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderWidth: 1,
              borderColor: "#2675bf",
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
          backgroundColor: "#2675bf",
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
          backgroundColor: "#f0f0f0",
          borderRight: "1px solid #d1d1d1",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "#f7f8fa",
          borderBottom: "1px solid #d1d1d1",
          color: "#000000",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 6,
          border: "1px solid #d1d1d1",
          boxShadow: `0 12px 40px ${alpha("#000", 0.15)}`,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 0,
          transition: "all 0.1s ease",
          "&:hover": { backgroundColor: alpha("#000000", 0.04) },
          "&.Mui-selected": {
            backgroundColor: alpha("#2675bf", 0.12),
            "&:hover": { backgroundColor: alpha("#2675bf", 0.16) },
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: "#ffffff",
          border: "1px solid #d1d1d1",
          borderRadius: 4,
          boxShadow: `0 8px 24px ${alpha("#000", 0.12)}`,
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
          backgroundColor: "#f7f8fa",
          color: "#000000",
          borderRadius: 3,
          fontSize: "0.75rem",
          border: "1px solid #d1d1d1",
          boxShadow: `0 4px 12px ${alpha("#000", 0.1)}`,
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          "& .MuiSwitch-switchBase.Mui-checked": { color: "#2675bf" },
          "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": { backgroundColor: "#2675bf" },
        },
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 3 } },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: "#d1d1d1" } },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: 3,
          textTransform: "none",
          fontWeight: 500,
          borderColor: "#d1d1d1",
          "&.Mui-selected": {
            backgroundColor: alpha("#2675bf", 0.12),
            color: "#1a5fa0",
            borderColor: "#2675bf",
            "&:hover": { backgroundColor: alpha("#2675bf", 0.16) },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderBottomColor: "#d1d1d1" } },
    },
    MuiBadge: {
      styleOverrides: { badge: { fontWeight: 600 } },
    },
  },
});

export default light;
