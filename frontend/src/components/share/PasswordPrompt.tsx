import { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  InputAdornment,
  IconButton,
} from "@mui/material";
import {
  Lock as LockIcon,
  Visibility,
  VisibilityOff,
  Api as ApiIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

interface PasswordPromptProps {
  title: string;
  onVerify: (password: string) => Promise<void>;
  error: string | null;
  loading: boolean;
}

export default function PasswordPrompt({
  title,
  onVerify,
  error,
  loading,
}: PasswordPromptProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) onVerify(password);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: 5,
          maxWidth: 440,
          width: "100%",
          textAlign: "center",
          borderRadius: 3,
          border: 1,
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: 2,
            bgcolor: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            mx: "auto",
            mb: 3,
          }}
        >
          <LockIcon sx={{ color: "#fff", fontSize: 28 }} />
        </Box>

        <Typography variant="h5" fontWeight={700} gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {t("share.passwordRequired")}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2, textAlign: "left" }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            type={showPassword ? "text" : "password"}
            label={t("share.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            sx={{ mb: 2 }}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <Button
            fullWidth
            variant="contained"
            type="submit"
            disabled={!password.trim() || loading}
            size="large"
          >
            {loading ? "..." : t("share.submit")}
          </Button>
        </form>

        <Box sx={{ mt: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5, opacity: 0.5 }}>
          <ApiIcon sx={{ fontSize: 16 }} />
          <Typography variant="caption">{t("share.poweredBy")}</Typography>
        </Box>
      </Paper>
    </Box>
  );
}
