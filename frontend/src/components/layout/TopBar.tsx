import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Select,
  MenuItem,
  Box,
  Chip,
  Tooltip,
  FormControl,
  Avatar,
} from "@mui/material";
import {
  DarkMode,
  LightMode,
  Logout,
  KeyboardArrowDown,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import type { Environment } from "@/types";

interface TopBarProps {
  mode: "dark" | "light";
  onToggleTheme: () => void;
  onLogout: () => void;
  username?: string;
  environments: Environment[];
  selectedEnvironmentId: string | null;
  onSelectEnvironment: (id: string | null) => void;
  workspaceName?: string;
}

const LANGUAGES = [
  { code: "en", label: "English", flag: "gb" },
  { code: "hu", label: "Magyar", flag: "hu" },
  { code: "de", label: "Deutsch", flag: "de" },
];

const ENV_COLORS: Record<string, string> = {
  LIVE: "#ef4444",
  TEST: "#f59e0b",
  DEV: "#10b981",
};

export default function TopBar({
  mode,
  onToggleTheme,
  onLogout,
  username,
  environments,
  selectedEnvironmentId,
  onSelectEnvironment,
  workspaceName,
}: TopBarProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isDark = mode === "dark";

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("openreq-lang", lang);
  };

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        zIndex: theme.zIndex.drawer + 1,
        borderBottom: `1px solid ${alpha(
          isDark ? "#8b949e" : "#64748b",
          0.1
        )}`,
        backgroundColor: isDark
          ? alpha("#0b0e14", 0.85)
          : alpha("#ffffff", 0.85),
        backdropFilter: "blur(20px) saturate(180%)",
        color: theme.palette.text.primary,
      }}
    >
      <Toolbar sx={{ gap: 1.5, minHeight: "52px !important", px: 2.5 }}>
        {/* Brand */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0 }}>
          {/* Logo mark */}
          <Box
            component="img"
            src="/logo.png"
            alt="OpenReq"
            sx={{
              width: 32,
              height: 32,
              filter: isDark
                ? "drop-shadow(0 2px 8px rgba(129, 140, 248, 0.3))"
                : "drop-shadow(0 2px 8px rgba(99, 102, 241, 0.2))",
            }}
          />
          <Typography
            variant="h6"
            sx={{
              fontWeight: 700,
              fontSize: "1.05rem",
              letterSpacing: "-0.02em",
              color: theme.palette.text.primary,
            }}
          >
            OpenReq
          </Typography>
          <Chip
            label={`v${__APP_VERSION__}`}
            size="small"
            sx={{
              height: 18,
              fontSize: "0.6rem",
              fontWeight: 600,
              borderRadius: 1,
              backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.15 : 0.1),
              color: theme.palette.primary.main,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
              "& .MuiChip-label": { px: 0.75 },
            }}
          />

          {workspaceName && (
            <>
              <Typography
                sx={{
                  color: theme.palette.text.secondary,
                  opacity: 0.3,
                  fontSize: "1rem",
                  fontWeight: 300,
                  mx: -0.5,
                }}
              >
                /
              </Typography>
              <Chip
                label={workspaceName}
                size="small"
                sx={{
                  height: 24,
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  borderRadius: 1.5,
                  backgroundColor: alpha(
                    theme.palette.text.primary,
                    isDark ? 0.06 : 0.05
                  ),
                  color: theme.palette.text.secondary,
                  border: "none",
                }}
              />
            </>
          )}
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {/* Environment Selector */}
        {environments.length > 0 && (
          <FormControl size="small">
            <Select
              value={selectedEnvironmentId ?? "__none__"}
              onChange={(e) =>
                onSelectEnvironment(
                  e.target.value === "__none__" ? null : e.target.value
                )
              }
              displayEmpty
              IconComponent={KeyboardArrowDown}
              sx={{
                height: 32,
                fontSize: "0.8rem",
                fontWeight: 500,
                borderRadius: 2,
                minWidth: 180,
                backgroundColor: alpha(
                  theme.palette.text.primary,
                  isDark ? 0.04 : 0.03
                ),
                border: `1px solid ${alpha(
                  isDark ? "#8b949e" : "#64748b",
                  0.12
                )}`,
                transition: "all 0.2s ease",
                "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                "&:hover": {
                  backgroundColor: alpha(
                    theme.palette.text.primary,
                    isDark ? 0.07 : 0.06
                  ),
                  borderColor: alpha(theme.palette.primary.main, 0.4),
                },
                "& .MuiSelect-icon": {
                  fontSize: "1.1rem",
                  color: theme.palette.text.secondary,
                },
              }}
            >
              <MenuItem value="__none__">
                <em style={{ opacity: 0.6 }}>{t("environment.select")}</em>
              </MenuItem>
              {environments.map((env) => (
                <MenuItem key={env.id} value={env.id}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    <Box
                      sx={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        bgcolor: ENV_COLORS[env.env_type] ?? "#888",
                        boxShadow: `0 0 6px ${
                          ENV_COLORS[env.env_type] ?? "#888"
                        }60`,
                      }}
                    />
                    <span style={{ fontWeight: 500 }}>{env.name}</span>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        ml: 0.5,
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {env.env_type}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <Box sx={{ flexGrow: 1 }} />

        {/* Right actions */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            flexShrink: 0,
          }}
        >
          {/* User avatar + name */}
          {username && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1,
                py: 0.5,
                borderRadius: 2,
                mr: 0.5,
              }}
            >
              <Avatar
                sx={{
                  width: 24,
                  height: 24,
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                }}
              >
                {username.charAt(0).toUpperCase()}
              </Avatar>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  fontSize: "0.8rem",
                  color: theme.palette.text.primary,
                }}
              >
                {username}
              </Typography>
            </Box>
          )}

          {/* Language */}
          <FormControl size="small">
            <Select
              value={i18n.language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              variant="standard"
              disableUnderline
              renderValue={(value) => {
                const lang = LANGUAGES.find((l) => l.code === value);
                return lang ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                    }}
                  >
                    <img
                      src={`https://flagcdn.com/w40/${lang.flag}.png`}
                      alt={lang.label}
                      style={{
                        width: 18,
                        height: 13,
                        objectFit: "cover",
                        borderRadius: 2,
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 600, fontSize: "0.75rem" }}
                    >
                      {lang.code.toUpperCase()}
                    </Typography>
                  </Box>
                ) : (
                  value
                );
              }}
              sx={{
                minWidth: 60,
                cursor: "pointer",
                "& .MuiSelect-select": {
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  py: "4px !important",
                  px: "6px !important",
                },
              }}
            >
              {LANGUAGES.map((lang) => (
                <MenuItem key={lang.code} value={lang.code}>
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 1 }}
                  >
                    <img
                      src={`https://flagcdn.com/w40/${lang.flag}.png`}
                      alt={lang.label}
                      style={{
                        width: 20,
                        height: 14,
                        objectFit: "cover",
                        borderRadius: 2,
                      }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {lang.label}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Theme toggle */}
          <Tooltip
            title={
              mode === "dark" ? t("common.lightMode") : t("common.darkMode")
            }
          >
            <IconButton
              onClick={onToggleTheme}
              size="small"
              sx={{
                width: 32,
                height: 32,
                borderRadius: 2,
                color: theme.palette.text.secondary,
                transition: "all 0.2s ease",
                "&:hover": {
                  backgroundColor: alpha(
                    theme.palette.text.primary,
                    isDark ? 0.08 : 0.06
                  ),
                  color: theme.palette.warning.main,
                },
              }}
            >
              {mode === "dark" ? (
                <LightMode sx={{ fontSize: 18 }} />
              ) : (
                <DarkMode sx={{ fontSize: 18 }} />
              )}
            </IconButton>
          </Tooltip>

          {/* Logout */}
          <Tooltip title={t("auth.logout")}>
            <IconButton
              onClick={onLogout}
              size="small"
              sx={{
                width: 32,
                height: 32,
                borderRadius: 2,
                color: theme.palette.text.secondary,
                transition: "all 0.2s ease",
                "&:hover": {
                  backgroundColor: alpha(theme.palette.error.main, 0.1),
                  color: theme.palette.error.main,
                },
              }}
            >
              <Logout sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
