import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  TextField,
  Button,
  Alert,
  Paper,
  InputAdornment,
  IconButton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
} from "@mui/material";
import {
  Visibility,
  VisibilityOff,
  Palette,
  Tune,
  SmartToy,
  AccountCircle,
  Lock,
  PeopleAlt,
  ArrowBack,
  PersonOff,
  PersonOutline,
  Delete,
  CheckCircle,
  Cancel,
  Refresh,
} from "@mui/icons-material";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import { appSettingsApi, usersApi } from "@/api/endpoints";
import type { User, OllamaModel } from "@/types";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "hu", label: "Magyar" },
];

interface SettingsProps {
  mode: "dark" | "light";
  onToggleTheme: () => void;
  user: User;
  onClose: () => void;
}

export default function Settings({ mode, onToggleTheme, user, onClose }: SettingsProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [proxyTimeout, setProxyTimeout] = useState("30");
  const [followRedirects, setFollowRedirects] = useState(true);
  const [saved, setSaved] = useState(false);

  // AI provider state
  const [aiProvider, setAiProvider] = useState<"openai" | "ollama">("openai");

  // OpenAI key state
  const [openaiKey, setOpenaiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [keyHint, setKeyHint] = useState<string | null>(null);

  // Ollama state
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://localhost:11434");
  const [ollamaModel, setOllamaModel] = useState("");
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaSaving, setOllamaSaving] = useState(false);
  const [ollamaSaved, setOllamaSaved] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // User management state
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userMsg, setUserMsg] = useState<{ msg: string; severity: "success" | "error" } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);

  // Load global settings on mount
  useEffect(() => {
    appSettingsApi
      .get()
      .then(({ data }) => {
        setHasKey(data.has_openai_key);
        setKeyHint(data.openai_api_key_hint);
        setAiProvider(data.ai_provider || "openai");
        if (data.ollama_base_url) setOllamaBaseUrl(data.ollama_base_url);
        if (data.ollama_model) setOllamaModel(data.ollama_model);
      })
      .catch(() => {});
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const { data } = await usersApi.list();
      setUsers(data);
    } catch {
      /* ignore */
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("openreq-lang", lang);
  };

  const handleSave = () => {
    localStorage.setItem("openreq-proxy-timeout", proxyTimeout);
    localStorage.setItem("openreq-follow-redirects", String(followRedirects));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveKey = async () => {
    if (!openaiKey.trim()) return;
    setKeySaving(true);
    setKeyError(null);
    try {
      const { data } = await appSettingsApi.update({ openai_api_key: openaiKey.trim() });
      setHasKey(data.has_openai_key);
      setKeyHint(data.openai_api_key_hint);
      setOpenaiKey("");
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 2000);
    } catch {
      setKeyError(t("common.error"));
    } finally {
      setKeySaving(false);
    }
  };

  const handleRemoveKey = async () => {
    setKeySaving(true);
    try {
      await appSettingsApi.update({ openai_api_key: "" });
      setHasKey(false);
      setKeyHint(null);
      setOpenaiKey("");
    } catch {
      setKeyError(t("common.error"));
    } finally {
      setKeySaving(false);
    }
  };

  const handleFetchOllamaModels = async () => {
    setOllamaModelsLoading(true);
    setOllamaError(null);
    try {
      const { data } = await appSettingsApi.getOllamaModels(ollamaBaseUrl.trim() || undefined);
      setOllamaModels(data);
      if (data.length === 0) {
        setOllamaError(t("settings.ollamaNoModels"));
      }
    } catch {
      setOllamaError(t("settings.ollamaConnectionFailed"));
      setOllamaModels([]);
    } finally {
      setOllamaModelsLoading(false);
    }
  };

  const handleSaveProvider = async () => {
    setOllamaSaving(true);
    setOllamaError(null);
    try {
      const { data } = await appSettingsApi.update({
        ai_provider: aiProvider,
        ollama_base_url: aiProvider === "ollama" ? ollamaBaseUrl.trim() : undefined,
        ollama_model: aiProvider === "ollama" ? ollamaModel : undefined,
      });
      setAiProvider(data.ai_provider || "openai");
      setOllamaSaved(true);
      setTimeout(() => setOllamaSaved(false), 2000);
    } catch {
      setOllamaError(t("common.error"));
    } finally {
      setOllamaSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPwError(null);
    if (newPassword.length < 8) {
      setPwError(t("settings.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(t("settings.passwordMismatch"));
      return;
    }
    setPwSaving(true);
    try {
      await usersApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPwSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwSuccess(false), 3000);
    } catch {
      setPwError(t("settings.passwordWrong"));
    } finally {
      setPwSaving(false);
    }
  };

  const handleToggleUserActive = async (u: User) => {
    try {
      await usersApi.adminUpdate(u.id, { is_active: !u.is_active });
      setUserMsg({ msg: t("settings.userUpdated"), severity: "success" });
      loadUsers();
      setTimeout(() => setUserMsg(null), 2000);
    } catch {
      setUserMsg({ msg: t("common.error"), severity: "error" });
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirm) return;
    try {
      await usersApi.deleteUser(deleteConfirm.id);
      setDeleteConfirm(null);
      setUserMsg({ msg: t("settings.userDeleted"), severity: "success" });
      loadUsers();
      setTimeout(() => setUserMsg(null), 2000);
    } catch {
      setUserMsg({ msg: t("common.error"), severity: "error" });
    }
  };

  const sectionStyle = {
    p: 3,
    borderRadius: 3,
    borderColor: isDark ? alpha("#8b949e", 0.1) : alpha("#64748b", 0.1),
  };

  return (
    <Box
      sx={{
        width: "100%",
        p: 3,
        display: "flex",
        flexDirection: "column",
        gap: 2.5,
        animation: "fadeIn 0.3s ease",
      }}
    >
      {/* Header with back button */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <IconButton onClick={onClose} size="small" sx={{ mr: 0.5 }}>
          <ArrowBack />
        </IconButton>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          {t("nav.settings")}
        </Typography>
      </Box>

      {saved && (
        <Alert severity="success" sx={{ borderRadius: 2 }}>
          {t("common.save")}!
        </Alert>
      )}

      {/* Two-column layout: left settings, right user management */}
      <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {/* Left column: core settings */}
        <Box sx={{ flex: "1 1 400px", display: "flex", flexDirection: "column", gap: 2.5, minWidth: 0 }}>
          {/* Appearance */}
          <Paper variant="outlined" sx={sectionStyle}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
              <Palette sx={{ fontSize: 20, color: "primary.main" }} />
              <Typography variant="subtitle1" fontWeight={600}>
                {t("settings.appearance")}
              </Typography>
            </Box>

            <FormControlLabel
              control={<Switch checked={mode === "dark"} onChange={onToggleTheme} />}
              label={mode === "dark" ? t("common.darkMode") : t("common.lightMode")}
              sx={{ mb: 1.5 }}
            />

            <FormControl fullWidth size="small" sx={{ maxWidth: 250 }}>
              <InputLabel>{t("common.language")}</InputLabel>
              <Select
                value={i18n.language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                label={t("common.language")}
              >
                {LANGUAGES.map((l) => (
                  <MenuItem key={l.code} value={l.code}>
                    {l.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Paper>

          {/* Request Defaults */}
          <Paper variant="outlined" sx={sectionStyle}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
              <Tune sx={{ fontSize: 20, color: "primary.main" }} />
              <Typography variant="subtitle1" fontWeight={600}>
                {t("settings.requestDefaults")}
              </Typography>
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label={t("settings.proxyTimeout")}
                type="number"
                size="small"
                value={proxyTimeout}
                onChange={(e) => setProxyTimeout(e.target.value)}
                sx={{ maxWidth: 200 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={followRedirects}
                    onChange={(e) => setFollowRedirects(e.target.checked)}
                  />
                }
                label={t("settings.followRedirects")}
              />
            </Box>
          </Paper>

          {/* AI Integration */}
          <Paper variant="outlined" sx={sectionStyle}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
              <SmartToy sx={{ fontSize: 20, color: "primary.main" }} />
              <Typography variant="subtitle1" fontWeight={600}>
                {t("settings.aiIntegration")}
              </Typography>
              <Chip
                label="BETA"
                size="small"
                sx={{
                  fontSize: "0.6rem",
                  height: 18,
                  fontWeight: 700,
                  borderRadius: 1,
                  background: `linear-gradient(135deg, ${theme.palette.warning.main}, ${theme.palette.warning.dark})`,
                  color: "#fff",
                }}
              />
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t("settings.aiProviderDescription")}
            </Typography>

            {ollamaSaved && (
              <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
                {t("settings.apiKeySaved")}
              </Alert>
            )}

            {/* Provider Toggle */}
            <Box sx={{ mb: 2.5 }}>
              <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
                {t("settings.aiProvider")}
              </Typography>
              <ToggleButtonGroup
                value={aiProvider}
                exclusive
                onChange={(_, v) => v && setAiProvider(v)}
                size="small"
              >
                <ToggleButton value="openai" sx={{ textTransform: "none", px: 3 }}>
                  OpenAI
                </ToggleButton>
                <ToggleButton value="ollama" sx={{ textTransform: "none", px: 3 }}>
                  Ollama
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* OpenAI Config */}
            {aiProvider === "openai" && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Typography variant="body2" color="text.secondary">
                  {t("settings.aiDescription")}
                </Typography>

                {keySaved && (
                  <Alert severity="success" sx={{ borderRadius: 2 }}>
                    {t("settings.apiKeySaved")}
                  </Alert>
                )}
                {keyError && (
                  <Alert severity="error" sx={{ borderRadius: 2 }}>
                    {keyError}
                  </Alert>
                )}

                {hasKey && (
                  <Alert severity="info" sx={{ borderRadius: 2 }}>
                    {t("settings.apiKeyConfigured")}: <strong>{keyHint}</strong>
                  </Alert>
                )}

                <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder={hasKey ? t("settings.apiKeyReplace") : "sk-..."}
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    type={showKey ? "text" : "password"}
                    InputProps={{
                      sx: {
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 13,
                      },
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowKey(!showKey)}>
                            {showKey ? (
                              <VisibilityOff fontSize="small" />
                            ) : (
                              <Visibility fontSize="small" />
                            )}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={handleSaveKey}
                    disabled={keySaving || !openaiKey.trim()}
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    {t("common.save")}
                  </Button>
                  {hasKey && (
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={handleRemoveKey}
                      disabled={keySaving}
                      sx={{ whiteSpace: "nowrap" }}
                    >
                      {t("common.remove")}
                    </Button>
                  )}
                </Box>
              </Box>
            )}

            {/* Ollama Config */}
            {aiProvider === "ollama" && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {ollamaError && (
                  <Alert severity="error" sx={{ borderRadius: 2 }} onClose={() => setOllamaError(null)}>
                    {ollamaError}
                  </Alert>
                )}

                <TextField
                  size="small"
                  label={t("settings.ollamaBaseUrl")}
                  value={ollamaBaseUrl}
                  onChange={(e) => setOllamaBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  InputProps={{
                    sx: { fontFamily: "'JetBrains Mono', monospace", fontSize: 13 },
                  }}
                />

                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <InputLabel>{t("settings.ollamaModel")}</InputLabel>
                    <Select
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      label={t("settings.ollamaModel")}
                    >
                      {ollamaModels.map((m) => (
                        <MenuItem key={m.name} value={m.name}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            {m.name}
                            {m.size && (
                              <Typography variant="caption" color="text.secondary">
                                ({(m.size / 1e9).toFixed(1)} GB)
                              </Typography>
                            )}
                          </Box>
                        </MenuItem>
                      ))}
                      {ollamaModel && !ollamaModels.find((m) => m.name === ollamaModel) && (
                        <MenuItem value={ollamaModel}>{ollamaModel}</MenuItem>
                      )}
                    </Select>
                  </FormControl>
                  <Button
                    variant="outlined"
                    onClick={handleFetchOllamaModels}
                    disabled={ollamaModelsLoading}
                    startIcon={
                      ollamaModelsLoading ? (
                        <CircularProgress size={16} />
                      ) : (
                        <Refresh />
                      )
                    }
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    {t("settings.ollamaFetchModels")}
                  </Button>
                </Box>

                {ollamaModels.length > 0 && (
                  <Alert severity="success" sx={{ borderRadius: 2 }}>
                    {t("settings.ollamaConnectionOk")} — {ollamaModels.length} {t("settings.ollamaFetchModels").toLowerCase()}
                  </Alert>
                )}
              </Box>
            )}

            {/* Save provider button */}
            <Button
              variant="contained"
              onClick={handleSaveProvider}
              disabled={ollamaSaving}
              sx={{ mt: 2, alignSelf: "flex-start" }}
            >
              {t("common.save")} {t("settings.aiProvider")}
            </Button>
          </Paper>

          {/* Account Info */}
          <Paper variant="outlined" sx={sectionStyle}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
              <AccountCircle sx={{ fontSize: 20, color: "primary.main" }} />
              <Typography variant="subtitle1" fontWeight={600}>
                {t("settings.account")}
              </Typography>
            </Box>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: 1.5,
                alignItems: "center",
              }}
            >
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                {t("auth.username")}
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {user.username}
              </Typography>

              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                {t("auth.email")}
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {user.email}
              </Typography>

              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                {t("auth.fullName")}
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {user.full_name || "—"}
              </Typography>
            </Box>
          </Paper>

          {/* Password Change */}
          <Paper variant="outlined" sx={sectionStyle}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
              <Lock sx={{ fontSize: 20, color: "primary.main" }} />
              <Typography variant="subtitle1" fontWeight={600}>
                {t("settings.passwordReset")}
              </Typography>
            </Box>

            {pwSuccess && (
              <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
                {t("settings.passwordChanged")}
              </Alert>
            )}
            {pwError && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                {pwError}
              </Alert>
            )}

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label={t("settings.currentPassword")}
                type="password"
                size="small"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                sx={{ maxWidth: 350 }}
              />
              <TextField
                label={t("settings.newPassword")}
                type="password"
                size="small"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                sx={{ maxWidth: 350 }}
              />
              <TextField
                label={t("settings.confirmNewPassword")}
                type="password"
                size="small"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                sx={{ maxWidth: 350 }}
              />
              <Button
                variant="contained"
                onClick={handleChangePassword}
                disabled={pwSaving || !currentPassword || !newPassword || !confirmPassword}
                sx={{ alignSelf: "flex-start", px: 3 }}
              >
                {t("settings.passwordReset")}
              </Button>
            </Box>
          </Paper>

          <Button
            variant="contained"
            onClick={handleSave}
            sx={{
              alignSelf: "flex-start",
              px: 4,
              borderRadius: 2,
            }}
          >
            {t("common.save")}
          </Button>
        </Box>

        {/* Right column: User management */}
        <Box sx={{ flex: "1 1 380px", minWidth: 0 }}>
          <Paper variant="outlined" sx={{ ...sectionStyle, height: "fit-content" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2.5 }}>
              <PeopleAlt sx={{ fontSize: 20, color: "primary.main" }} />
              <Typography variant="subtitle1" fontWeight={600}>
                {t("settings.userManagement")}
              </Typography>
              <Chip
                label={users.length}
                size="small"
                sx={{
                  fontSize: "0.7rem",
                  height: 20,
                  fontWeight: 700,
                  borderRadius: 1,
                }}
              />
            </Box>

            {userMsg && (
              <Alert severity={userMsg.severity} sx={{ mb: 2, borderRadius: 2 }}>
                {userMsg.msg}
              </Alert>
            )}

            {usersLoading ? (
              <Typography variant="body2" color="text.secondary">
                {t("common.loading")}
              </Typography>
            ) : users.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t("settings.noUsers")}
              </Typography>
            ) : (
              <TableContainer sx={{ maxHeight: 500 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>
                        {t("auth.username")}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }}>
                        {t("auth.email")}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }} align="center">
                        {t("settings.status")}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, fontSize: "0.75rem" }} align="right">
                        &nbsp;
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {users.map((u) => {
                      const isSelf = u.id === user.id;
                      return (
                        <TableRow
                          key={u.id}
                          sx={{
                            opacity: u.is_active ? 1 : 0.5,
                            "&:hover": { backgroundColor: alpha(theme.palette.primary.main, 0.04) },
                          }}
                        >
                          <TableCell sx={{ fontSize: "0.8rem" }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                              {u.username}
                              {isSelf && (
                                <Chip
                                  label="You"
                                  size="small"
                                  color="primary"
                                  sx={{ fontSize: "0.6rem", height: 16, fontWeight: 700 }}
                                />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontSize: "0.8rem" }}>{u.email}</TableCell>
                          <TableCell align="center">
                            {u.is_active ? (
                              <CheckCircle sx={{ fontSize: 16, color: "success.main" }} />
                            ) : (
                              <Cancel sx={{ fontSize: 16, color: "error.main" }} />
                            )}
                          </TableCell>
                          <TableCell align="right">
                            {!isSelf && (
                              <Box sx={{ display: "flex", gap: 0.5, justifyContent: "flex-end" }}>
                                <Tooltip
                                  title={u.is_active ? t("settings.deactivateUser") : t("settings.activateUser")}
                                >
                                  <IconButton
                                    size="small"
                                    onClick={() => handleToggleUserActive(u)}
                                    sx={{ width: 28, height: 28 }}
                                  >
                                    {u.is_active ? (
                                      <PersonOff sx={{ fontSize: 16 }} />
                                    ) : (
                                      <PersonOutline sx={{ fontSize: 16 }} />
                                    )}
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title={t("settings.deleteUser")}>
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => setDeleteConfirm(u)}
                                    sx={{ width: 28, height: 28 }}
                                  >
                                    <Delete sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Box>
      </Box>

      {/* Delete user confirmation dialog */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t("settings.deleteUser")}</DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            dangerouslySetInnerHTML={{
              __html: t("settings.deleteUserConfirm", { name: deleteConfirm?.username ?? "" }),
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>{t("common.cancel")}</Button>
          <Button variant="contained" color="error" onClick={handleDeleteUser}>
            {t("common.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
