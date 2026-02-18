import { useState, useRef } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  Link,
  Alert,
  CircularProgress,
  Paper,
  InputAdornment,
  IconButton,
  MenuItem,
} from "@mui/material";
import { Visibility, VisibilityOff, Email, Lock, Person, Badge, DarkMode, LightMode } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import axios from "axios";
import { authApi } from "@/api/endpoints";
import NeuralGrid from "@/components/NeuralGrid";

interface LoginProps {
  onLogin: (email: string, password: string) => Promise<void>;
  mode: "dark" | "light";
  onToggleTheme: () => void;
}

const LANGUAGES = [
  { code: "en", label: "English", flag: "gb" },
  { code: "hu", label: "Magyar", flag: "hu" },
  { code: "de", label: "Deutsch", flag: "de" },
];

export default function Login({ onLogin, mode, onToggleTheme }: LoginProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);

  const formatValidationError = (detail: unknown) => {
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          const loc = Array.isArray(item?.loc) ? item.loc.slice(1).join(".") : "field";
          const msg = typeof item?.msg === "string" ? item.msg : "Invalid value";
          return `${loc}: ${msg}`;
        })
        .join(" | ");
    }
    if (typeof detail === "string") return detail;
    return t("auth.invalidCredentials");
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("openreq-lang", lang);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isRegister) {
        await authApi.register({ email, username, password, full_name: fullName || undefined });
      }
      await onLogin(email, password);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const detail = err.response?.data?.detail;
        if (status === 422) {
          setError(formatValidationError(detail));
          return;
        }
        if ((status === 403 || status === 409) && typeof detail === "string") {
          setError(detail);
          return;
        }
        if (status === 401) {
          setError(t("auth.invalidCredentials"));
          return;
        }
        if (typeof detail === "string") {
          setError(detail);
          return;
        }
      }
      setError(t("auth.invalidCredentials"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: isDark
          ? `radial-gradient(ellipse at 20% 50%, ${alpha("#818cf8", 0.08)} 0%, transparent 50%),
             radial-gradient(ellipse at 80% 20%, ${alpha("#c084fc", 0.06)} 0%, transparent 50%),
             radial-gradient(ellipse at 50% 80%, ${alpha("#34d399", 0.04)} 0%, transparent 50%),
             #0b0e14`
          : `radial-gradient(ellipse at 20% 50%, ${alpha("#6366f1", 0.06)} 0%, transparent 50%),
             radial-gradient(ellipse at 80% 20%, ${alpha("#a855f7", 0.04)} 0%, transparent 50%),
             radial-gradient(ellipse at 50% 80%, ${alpha("#10b981", 0.03)} 0%, transparent 50%),
             #f8fafc`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Neural network grid canvas */}
      <NeuralGrid isDark={isDark} repelElementRef={logoRef} />

      {/* Top right controls */}
      <Box
        sx={{
          position: "fixed",
          top: 20,
          right: 20,
          display: "flex",
          gap: 1,
          zIndex: 10,
        }}
      >
        <IconButton
          onClick={onToggleTheme}
          size="small"
          sx={{
            width: 36,
            height: 36,
            borderRadius: 2,
            color: theme.palette.text.secondary,
            backgroundColor: isDark
              ? alpha("#111620", 0.6)
              : alpha("#ffffff", 0.7),
            backdropFilter: "blur(12px)",
            border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.12)}`,
            "&:hover": {
              backgroundColor: alpha(
                theme.palette.text.primary,
                isDark ? 0.12 : 0.1
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
        <TextField
          select
          size="small"
          value={i18n.language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          sx={{
            minWidth: 130,
            "& .MuiOutlinedInput-root": {
              borderRadius: 2,
              fontSize: "0.8rem",
              backgroundColor: isDark
                ? alpha("#111620", 0.6)
                : alpha("#ffffff", 0.7),
              backdropFilter: "blur(12px)",
              border: `1px solid ${alpha(isDark ? "#8b949e" : "#64748b", 0.12)}`,
            },
          }}
        >
          {LANGUAGES.map((lang) => (
            <MenuItem key={lang.code} value={lang.code}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <img
                  src={`https://flagcdn.com/w40/${lang.flag}.png`}
                  alt={lang.label}
                  style={{ width: 18, height: 13, borderRadius: 2 }}
                />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {lang.label}
                </Typography>
              </Box>
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo - floating above card, repels grid nodes */}
        <Box
          ref={logoRef}
          sx={{
            position: "absolute",
            bottom: "calc(100% + 48px)",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          <Box
            component="img"
            src="/logo.png"
            alt="OpenReq"
            sx={{
              width: 96,
              height: 96,
              mb: 2.5,
              filter: isDark
                ? "drop-shadow(0 6px 24px rgba(129, 140, 248, 0.5)) drop-shadow(0 2px 8px rgba(192, 132, 252, 0.3))"
                : "drop-shadow(0 6px 24px rgba(99, 102, 241, 0.35)) drop-shadow(0 2px 8px rgba(168, 85, 247, 0.2))",
            }}
          />
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              letterSpacing: "-0.03em",
              background: isDark
                ? "linear-gradient(135deg, #c7d2fe 0%, #818cf8 45%, #c084fc 100%)"
                : "linear-gradient(135deg, #4338ca 0%, #6366f1 45%, #a855f7 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            OpenReq
          </Typography>
          <Typography
            variant="body1"
            sx={{
              mt: 1,
              fontWeight: 500,
              letterSpacing: "0.02em",
              background: isDark
                ? "linear-gradient(90deg, #94a3b8 0%, #818cf8 100%)"
                : "linear-gradient(90deg, #64748b 0%, #6366f1 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {t("app.tagline")}
          </Typography>
        </Box>

        <Paper
          variant="outlined"
          sx={{
            p: 5,
            width: 420,
            maxWidth: "90vw",
            borderRadius: 4,
            position: "relative",
            borderColor: isDark
              ? alpha("#8b949e", 0.12)
              : alpha("#64748b", 0.12),
            backgroundColor: isDark
              ? alpha("#111620", 0.8)
              : alpha("#ffffff", 0.9),
            backdropFilter: "blur(20px) saturate(150%)",
            boxShadow: isDark
              ? `0 32px 64px ${alpha("#000", 0.4)}, 0 0 0 1px ${alpha("#8b949e", 0.08)}`
              : `0 32px 64px ${alpha("#000", 0.08)}, 0 0 0 1px ${alpha("#64748b", 0.06)}`,
          }}
        >
        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 2.5,
              borderRadius: 2,
            }}
          >
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label={t("auth.email")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Email sx={{ fontSize: 18, color: "text.secondary", opacity: 0.5 }} />
                  </InputAdornment>
                ),
              }}
            />
            {isRegister && (
              <>
                <TextField
                  label={t("auth.username")}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  fullWidth
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Person sx={{ fontSize: 18, color: "text.secondary", opacity: 0.5 }} />
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  label={t("auth.fullName")}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  fullWidth
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Badge sx={{ fontSize: 18, color: "text.secondary", opacity: 0.5 }} />
                      </InputAdornment>
                    ),
                  }}
                />
              </>
            )}
            <TextField
              label={t("auth.password")}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Lock sx={{ fontSize: 18, color: "text.secondary", opacity: 0.5 }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowPassword(!showPassword)}
                      sx={{ color: "text.secondary", opacity: 0.5 }}
                    >
                      {showPassword ? <VisibilityOff sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18 }} />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              size="large"
              startIcon={
                loading ? <CircularProgress size={16} /> : undefined
              }
              sx={{
                mt: 1,
                height: 44,
                borderRadius: 2.5,
                fontWeight: 600,
                fontSize: "0.9rem",
              }}
            >
              {isRegister ? t("auth.register") : t("auth.login")}
            </Button>
          </Box>
        </form>

        <Typography
          variant="body2"
          textAlign="center"
          sx={{
            mt: 3,
            color: "text.secondary",
          }}
        >
          {isRegister ? t("auth.hasAccount") : t("auth.noAccount")}{" "}
          <Link
            component="button"
            onClick={() => setIsRegister(!isRegister)}
            underline="hover"
            sx={{
              fontWeight: 600,
              color: "primary.main",
            }}
          >
            {isRegister ? t("auth.login") : t("auth.register")}
          </Link>
        </Typography>
      </Paper>
      </Box>
    </Box>
  );
}
