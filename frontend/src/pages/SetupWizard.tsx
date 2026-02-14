import { useState, useRef } from "react";
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  InputAdornment,
  IconButton,
  Stepper,
  Step,
  StepLabel,
  Alert,
  CircularProgress,
  Fade,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Email,
  Lock,
  Person,
  Badge,
  DarkMode,
  LightMode,
  Key,
  CheckCircle,
  RocketLaunch,
  Add,
  Delete,
  FolderSpecial,
  Dns,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import { setupApi } from "@/api/endpoints";
import NeuralGrid from "@/components/NeuralGrid";

interface SetupWizardProps {
  onComplete: () => Promise<void>;
  mode: "dark" | "light";
  setMode: (mode: "dark" | "light") => void;
}

interface EnvironmentEntry {
  name: string;
  env_type: string;
}

const LANGUAGES = [
  { code: "en", label: "English", flag: "gb" },
  { code: "hu", label: "Magyar", flag: "hu" },
  { code: "de", label: "Deutsch", flag: "de" },
];

const ENV_TYPE_COLORS: Record<string, "error" | "warning" | "success"> = {
  LIVE: "error",
  TEST: "warning",
  DEV: "success",
};

export default function SetupWizard({ onComplete, mode, setMode }: SetupWizardProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const logoRef = useRef<HTMLDivElement>(null);

  const [activeStep, setActiveStep] = useState(0);
  const [language, setLanguage] = useState(i18n.language);

  // Account fields
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Workspace
  const [workspaceName, setWorkspaceName] = useState("");

  // Environments
  const [environments, setEnvironments] = useState<EnvironmentEntry[]>([
    { name: "Development", env_type: "DEV" },
  ]);

  // API Key
  const [openaiKey, setOpenaiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  // Status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const steps = [
    t("setup.stepLanguage"),
    t("setup.stepTheme"),
    t("setup.stepAccount"),
    t("setup.stepWorkspace"),
    t("setup.stepEnvironment"),
    t("setup.stepApiKey"),
  ];

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    i18n.changeLanguage(lang);
    localStorage.setItem("openreq-lang", lang);
  };

  const handleThemeChange = (themeMode: "dark" | "light") => {
    setMode(themeMode);
    localStorage.setItem("openreq-theme", themeMode);
  };

  const validateAccountStep = (): boolean => {
    const errors: Record<string, string> = {};
    if (!email) errors.email = t("setup.emailRequired");
    if (username.length < 3) errors.username = t("setup.usernameTooShort");
    if (password.length < 8) errors.password = t("setup.passwordTooShort");
    if (password !== confirmPassword) errors.confirmPassword = t("setup.passwordMismatch");
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateWorkspaceStep = (): boolean => {
    const errors: Record<string, string> = {};
    if (!workspaceName.trim()) errors.workspaceName = t("setup.workspaceNameRequired");
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateEnvironmentStep = (): boolean => {
    const errors: Record<string, string> = {};
    if (environments.length === 0) errors.environments = t("setup.environmentRequired");
    const hasEmptyName = environments.some((env) => !env.name.trim());
    if (hasEmptyName) errors.environments = t("setup.environmentRequired");
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (activeStep === 2 && !validateAccountStep()) return;
    if (activeStep === 3 && !validateWorkspaceStep()) return;
    if (activeStep === 4 && !validateEnvironmentStep()) return;
    setActiveStep((prev) => prev + 1);
    setError("");
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
    setError("");
  };

  const handleFinish = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await setupApi.initialize({
        email,
        username,
        password,
        full_name: fullName || undefined,
        openai_api_key: openaiKey || undefined,
        workspace_name: workspaceName,
        environments: environments,
      });
      localStorage.setItem("openreq-token", data.access_token);
      setComplete(true);
      setTimeout(() => onComplete(), 1500);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleAddEnvironment = () => {
    setEnvironments((prev) => [...prev, { name: "", env_type: "DEV" }]);
  };

  const handleRemoveEnvironment = (index: number) => {
    if (environments.length <= 1) return;
    setEnvironments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEnvironmentChange = (index: number, field: keyof EnvironmentEntry, value: string) => {
    setEnvironments((prev) =>
      prev.map((env, i) => (i === index ? { ...env, [field]: value } : env))
    );
    setFieldErrors((p) => ({ ...p, environments: "" }));
  };

  const iconSx = { fontSize: 18, color: "text.secondary", opacity: 0.5 };

  // ── Step content renderers ──

  const renderLanguageStep = () => (
    <Box sx={{ textAlign: "center", py: 2 }}>
      <RocketLaunch sx={{ fontSize: 48, color: "primary.main", mb: 2, opacity: 0.8 }} />
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        {t("setup.welcome")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {t("setup.welcomeDescription")}
      </Typography>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
        {t("setup.selectLanguage")}
      </Typography>
      <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
        {LANGUAGES.map((lang) => (
          <Paper
            key={lang.code}
            variant="outlined"
            onClick={() => handleLanguageChange(lang.code)}
            sx={{
              p: 2.5,
              cursor: "pointer",
              borderRadius: 3,
              textAlign: "center",
              width: 140,
              transition: "all 0.2s ease",
              borderColor:
                language === lang.code
                  ? "primary.main"
                  : isDark
                    ? alpha("#8b949e", 0.15)
                    : alpha("#64748b", 0.15),
              borderWidth: language === lang.code ? 2 : 1,
              backgroundColor:
                language === lang.code
                  ? alpha(theme.palette.primary.main, 0.08)
                  : "transparent",
              "&:hover": {
                borderColor: "primary.main",
                backgroundColor: alpha(theme.palette.primary.main, 0.04),
              },
            }}
          >
            <Box
              component="img"
              src={`https://flagcdn.com/w80/${lang.flag}.png`}
              alt={lang.label}
              sx={{
                width: 48,
                height: 36,
                borderRadius: 1,
                mb: 1.5,
                objectFit: "cover",
                boxShadow: `0 2px 8px ${alpha("#000", 0.15)}`,
              }}
            />
            <Typography
              variant="body2"
              sx={{
                fontWeight: language === lang.code ? 700 : 500,
                color: language === lang.code ? "primary.main" : "text.primary",
              }}
            >
              {lang.label}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );

  const renderThemeStep = () => (
    <Box sx={{ textAlign: "center", py: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
        {t("setup.selectTheme")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        {t("setup.themeDescription")}
      </Typography>
      <Box sx={{ display: "flex", gap: 3, justifyContent: "center" }}>
        {(["dark", "light"] as const).map((themeMode) => (
          <Paper
            key={themeMode}
            variant="outlined"
            onClick={() => handleThemeChange(themeMode)}
            sx={{
              p: 3,
              cursor: "pointer",
              width: 200,
              borderRadius: 3,
              textAlign: "center",
              transition: "all 0.2s ease",
              borderColor:
                mode === themeMode
                  ? "primary.main"
                  : isDark
                    ? alpha("#8b949e", 0.15)
                    : alpha("#64748b", 0.15),
              borderWidth: mode === themeMode ? 2 : 1,
              backgroundColor:
                mode === themeMode
                  ? alpha(theme.palette.primary.main, 0.08)
                  : "transparent",
              "&:hover": {
                borderColor: "primary.main",
                backgroundColor: alpha(theme.palette.primary.main, 0.04),
              },
            }}
          >
            {themeMode === "dark" ? (
              <DarkMode sx={{ fontSize: 48, color: "#818cf8", mb: 1.5 }} />
            ) : (
              <LightMode sx={{ fontSize: 48, color: "#f59e0b", mb: 1.5 }} />
            )}
            <Typography variant="body1" sx={{ fontWeight: mode === themeMode ? 700 : 500, mb: 1.5 }}>
              {themeMode === "dark" ? t("common.darkMode") : t("common.lightMode")}
            </Typography>
            {/* Color swatches */}
            <Box sx={{ display: "flex", gap: 0.75, justifyContent: "center" }}>
              {(themeMode === "dark"
                ? ["#818cf8", "#c084fc", "#34d399", "#0b0e14"]
                : ["#6366f1", "#a855f7", "#10b981", "#f8fafc"]
              ).map((color) => (
                <Box
                  key={color}
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    bgcolor: color,
                    border: `1px solid ${alpha("#000", 0.1)}`,
                  }}
                />
              ))}
            </Box>
          </Paper>
        ))}
      </Box>
    </Box>
  );

  const renderAccountStep = () => (
    <Box sx={{ py: 1 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
        {t("setup.createAdmin")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t("setup.createAdminDescription")}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          label={t("auth.email")}
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: "" })); }}
          required
          fullWidth
          error={!!fieldErrors.email}
          helperText={fieldErrors.email}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Email sx={iconSx} />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          label={t("auth.username")}
          value={username}
          onChange={(e) => { setUsername(e.target.value); setFieldErrors((p) => ({ ...p, username: "" })); }}
          required
          fullWidth
          error={!!fieldErrors.username}
          helperText={fieldErrors.username}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Person sx={iconSx} />
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
                <Badge sx={iconSx} />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          label={t("auth.password")}
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: "" })); }}
          required
          fullWidth
          error={!!fieldErrors.password}
          helperText={fieldErrors.password}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Lock sx={iconSx} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setShowPassword(!showPassword)} sx={{ color: "text.secondary", opacity: 0.5 }}>
                  {showPassword ? <VisibilityOff sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18 }} />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <TextField
          label={t("setup.confirmPassword")}
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors((p) => ({ ...p, confirmPassword: "" })); }}
          required
          fullWidth
          error={!!fieldErrors.confirmPassword}
          helperText={fieldErrors.confirmPassword}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Lock sx={iconSx} />
              </InputAdornment>
            ),
          }}
        />
      </Box>
    </Box>
  );

  const renderWorkspaceStep = () => (
    <Box sx={{ py: 2 }}>
      <Box sx={{ textAlign: "center", mb: 3 }}>
        <FolderSpecial sx={{ fontSize: 48, color: "primary.main", mb: 2, opacity: 0.8 }} />
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
          {t("setup.createWorkspace")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("setup.createWorkspaceDescription")}
        </Typography>
      </Box>
      <TextField
        label={t("workspace.name")}
        value={workspaceName}
        onChange={(e) => { setWorkspaceName(e.target.value); setFieldErrors((p) => ({ ...p, workspaceName: "" })); }}
        required
        fullWidth
        error={!!fieldErrors.workspaceName}
        helperText={fieldErrors.workspaceName}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <FolderSpecial sx={iconSx} />
            </InputAdornment>
          ),
        }}
      />
    </Box>
  );

  const renderEnvironmentStep = () => (
    <Box sx={{ py: 1 }}>
      <Box sx={{ textAlign: "center", mb: 3 }}>
        <Dns sx={{ fontSize: 48, color: "primary.main", mb: 2, opacity: 0.8 }} />
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
          {t("setup.createEnvironment")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("setup.createEnvironmentDescription")}
        </Typography>
      </Box>

      {fieldErrors.environments && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
          {fieldErrors.environments}
        </Alert>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {environments.map((env, index) => (
          <Box
            key={index}
            sx={{
              display: "flex",
              gap: 1.5,
              alignItems: "center",
              p: 2,
              borderRadius: 2,
              border: `1px solid ${isDark ? alpha("#8b949e", 0.12) : alpha("#64748b", 0.12)}`,
              backgroundColor: isDark ? alpha("#111620", 0.4) : alpha("#f8fafc", 0.6),
              transition: "all 0.2s ease",
            }}
          >
            <TextField
              label={t("setup.createEnvironment")}
              value={env.name}
              onChange={(e) => handleEnvironmentChange(index, "name", e.target.value)}
              required
              sx={{ flex: 1 }}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Dns sx={iconSx} />
                  </InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>{t("setup.stepEnvironment")}</InputLabel>
              <Select
                value={env.env_type}
                label={t("setup.stepEnvironment")}
                onChange={(e) => handleEnvironmentChange(index, "env_type", e.target.value)}
              >
                <MenuItem value="DEV">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Chip label={t("environment.dev")} size="small" color="success" sx={{ height: 22, fontSize: "0.75rem" }} />
                  </Box>
                </MenuItem>
                <MenuItem value="TEST">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Chip label={t("environment.test")} size="small" color="warning" sx={{ height: 22, fontSize: "0.75rem" }} />
                  </Box>
                </MenuItem>
                <MenuItem value="LIVE">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Chip label={t("environment.live")} size="small" color="error" sx={{ height: 22, fontSize: "0.75rem" }} />
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>
            <Chip
              label={env.env_type}
              size="small"
              color={ENV_TYPE_COLORS[env.env_type] || "default"}
              sx={{ fontWeight: 600, fontSize: "0.7rem", minWidth: 48 }}
            />
            <IconButton
              size="small"
              onClick={() => handleRemoveEnvironment(index)}
              disabled={environments.length <= 1}
              sx={{
                color: environments.length <= 1 ? "text.disabled" : "error.main",
                opacity: environments.length <= 1 ? 0.3 : 0.7,
                "&:hover": {
                  opacity: 1,
                  backgroundColor: alpha(theme.palette.error.main, 0.08),
                },
              }}
            >
              <Delete sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
        ))}
      </Box>

      <Button
        variant="outlined"
        startIcon={<Add />}
        onClick={handleAddEnvironment}
        sx={{
          mt: 2,
          borderRadius: 2,
          borderStyle: "dashed",
          textTransform: "none",
          fontWeight: 500,
        }}
      >
        {t("setup.addEnvironment")}
      </Button>
    </Box>
  );

  const renderApiKeyStep = () => (
    <Box sx={{ py: 2 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
        {t("setup.apiKeyTitle")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t("setup.apiKeyDescription")}
      </Typography>
      <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
        {t("setup.apiKeyOptional")}
      </Alert>
      <TextField
        fullWidth
        label="OpenAI API Key"
        placeholder="sk-..."
        value={openaiKey}
        onChange={(e) => setOpenaiKey(e.target.value)}
        type={showKey ? "text" : "password"}
        InputProps={{
          sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: 13 },
          startAdornment: (
            <InputAdornment position="start">
              <Key sx={iconSx} />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setShowKey(!showKey)} sx={{ color: "text.secondary", opacity: 0.5 }}>
                {showKey ? <VisibilityOff sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18 }} />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
    </Box>
  );

  const renderCompleteStep = () => (
    <Box sx={{ textAlign: "center", py: 4 }}>
      <CheckCircle sx={{ fontSize: 72, color: "success.main", mb: 2 }} />
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        {t("setup.complete")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t("setup.completeDescription")}
      </Typography>
    </Box>
  );

  const stepContent = [
    renderLanguageStep,
    renderThemeStep,
    renderAccountStep,
    renderWorkspaceStep,
    renderEnvironmentStep,
    renderApiKeyStep,
  ];

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
      <NeuralGrid isDark={isDark} repelElementRef={logoRef} />

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo */}
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

        {/* Wizard card */}
        <Paper
          variant="outlined"
          sx={{
            p: 5,
            width: 620,
            maxWidth: "90vw",
            borderRadius: 4,
            position: "relative",
            borderColor: isDark ? alpha("#8b949e", 0.12) : alpha("#64748b", 0.12),
            backgroundColor: isDark ? alpha("#111620", 0.8) : alpha("#ffffff", 0.9),
            backdropFilter: "blur(20px) saturate(150%)",
            boxShadow: isDark
              ? `0 32px 64px ${alpha("#000", 0.4)}, 0 0 0 1px ${alpha("#8b949e", 0.08)}`
              : `0 32px 64px ${alpha("#000", 0.08)}, 0 0 0 1px ${alpha("#64748b", 0.06)}`,
          }}
        >
          {/* Stepper */}
          {!complete && (
            <Stepper
              activeStep={activeStep}
              sx={{
                mb: 4,
                "& .MuiStepLabel-label": { fontSize: "0.75rem" },
              }}
            >
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          )}

          {/* Error */}
          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          {/* Step content */}
          {complete ? (
            <Fade in timeout={500}>
              <div>{renderCompleteStep()}</div>
            </Fade>
          ) : (
            stepContent.map((render, idx) => (
              <Fade in={activeStep === idx} key={idx} timeout={300} unmountOnExit>
                <Box sx={{ display: activeStep === idx ? "block" : "none" }}>
                  {render()}
                </Box>
              </Fade>
            ))
          )}

          {/* Navigation buttons */}
          {!complete && (
            <Box sx={{ display: "flex", justifyContent: "space-between", mt: 3 }}>
              <Button
                disabled={activeStep === 0}
                onClick={handleBack}
                sx={{ visibility: activeStep === 0 ? "hidden" : "visible" }}
              >
                {t("setup.back")}
              </Button>
              {activeStep < 5 ? (
                <Button variant="contained" onClick={handleNext} sx={{ borderRadius: 2.5, fontWeight: 600, px: 4 }}>
                  {t("setup.next")}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  onClick={handleFinish}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={16} /> : undefined}
                  sx={{ borderRadius: 2.5, fontWeight: 600, px: 4 }}
                >
                  {loading ? t("setup.settingUp") : t("setup.finish")}
                </Button>
              )}
            </Box>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
