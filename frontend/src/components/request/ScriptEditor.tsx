import { useState, useRef, useCallback } from "react";
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  CircularProgress,
  Divider,
  Drawer,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import {
  CheckCircle,
  Cancel,
  Terminal,
  Code,
  AutoAwesome,
  MenuBook,
  Close,
  ContentPaste,
} from "@mui/icons-material";
import Editor, { type Monaco } from "@monaco-editor/react";
import { useTheme, alpha } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { registerVariableProviders, getVariableTheme } from "@/utils/monacoVariables";
import { scriptsApi } from "@/api/endpoints";
import type { ScriptResult, ScriptLanguage } from "@/types";
import type { VariableGroup, VariableInfo } from "@/hooks/useVariableGroups";

interface ScriptEditorProps {
  preRequestScript: string;
  postResponseScript: string;
  scriptResult: ScriptResult | null;
  preRequestResult: ScriptResult | null;
  onPreRequestScriptChange: (s: string) => void;
  onPostResponseScriptChange: (s: string) => void;
  scriptLanguage: ScriptLanguage;
  onScriptLanguageChange: (lang: ScriptLanguage) => void;
  variableGroups?: VariableGroup[];
  resolvedVariables?: Map<string, VariableInfo>;
}

// ── Templates ──

const JS_PRE_REQUEST_TEMPLATE = `// Pre-request script - runs before the request is sent
// One command per line. Remove // to activate a line.

// console.log("Hello from pre-request!");
// req.variables.set("timestamp", String(Date.now()));
// req.variables.set("myToken", "abc123");
// console.log("Timestamp: " + String(Date.now()));
`;

const JS_POST_RESPONSE_TEMPLATE = `// Post-response tests - runs after the response arrives
// One command per line. Remove // to activate a line.

// req.test("Status is 200", req.response.status === 200);
// req.test("Response time < 500ms", req.response.time < 500);
// req.test("Body not empty", req.response.body.length > 0);
// req.test("Valid JSON", req.response.json !== null);
// console.log("Status: " + String(req.response.status));
`;

const PY_PRE_REQUEST_TEMPLATE = `# Pre-request script - runs before the request is sent
# One command per line. Remove # to activate a line.

# req.log("Hello from pre-request!")
# req.variables.set("timestamp", str(int(time.time())))
# req.variables.set("myToken", "abc123")
# req.log("Timestamp: " + str(int(time.time())))
`;

const PY_POST_RESPONSE_TEMPLATE = `# Post-response tests - runs after the response arrives
# One command per line. Remove # to activate a line.

# req.test("Status is 200", req.response.status == 200)
# req.test("Response time < 500ms", req.response.time < 500)
# req.test("Body not empty", len(req.response.body) > 0)
# req.test("Valid JSON", req.response.json is not None)
# req.log("Status: " + str(req.response.status))
`;

export default function ScriptEditor({
  preRequestScript,
  postResponseScript,
  scriptResult,
  preRequestResult,
  onPreRequestScriptChange,
  onPostResponseScriptChange,
  scriptLanguage,
  onScriptLanguageChange,
  variableGroups = [],
  resolvedVariables,
}: ScriptEditorProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [scriptTab, setScriptTab] = useState<"pre" | "post" | "output">("pre");
  const isDark = theme.palette.mode === "dark";
  const editorTheme = getVariableTheme(isDark);

  const isJS = scriptLanguage === "javascript";
  const editorLang = isJS ? "javascript" : "python";
  const preTemplate = isJS ? JS_PRE_REQUEST_TEMPLATE : PY_PRE_REQUEST_TEMPLATE;
  const postTemplate = isJS ? JS_POST_RESPONSE_TEMPLATE : PY_POST_RESPONSE_TEMPLATE;

  // AI generation state
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiDialogType, setAiDialogType] = useState<"pre-request" | "post-response">("post-response");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Docs drawer
  const [docsOpen, setDocsOpen] = useState(false);

  // Keep latest variables in a ref so Monaco providers always see fresh data
  const variablesRef = useRef({ groups: variableGroups, resolved: resolvedVariables ?? new Map<string, VariableInfo>() });
  variablesRef.current = { groups: variableGroups, resolved: resolvedVariables ?? new Map<string, VariableInfo>() };

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    registerVariableProviders(monaco, () => variablesRef.current);
  }, []);

  // Post-response results
  const testResults = scriptResult?.test_results ?? [];
  const passedCount = testResults.filter((r) => r.passed).length;
  const failedCount = testResults.filter((r) => !r.passed).length;
  const postLogs = scriptResult?.logs ?? [];

  // Pre-request results
  const preLogs = preRequestResult?.logs ?? [];
  const preErrors = preRequestResult?.test_results?.filter((r) => !r.passed) ?? [];
  const hasPreOutput = preLogs.length > 0 || preErrors.length > 0;

  const openAiDialog = (type: "pre-request" | "post-response") => {
    setAiDialogType(type);
    setAiPrompt("");
    setAiError(null);
    setAiDialogOpen(true);
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setAiError(null);
    try {
      const { data } = await scriptsApi.generateWithAI({
        description: aiPrompt.trim(),
        script_type: aiDialogType,
        language: scriptLanguage,
      });
      if (aiDialogType === "pre-request") {
        onPreRequestScriptChange(data.script);
      } else {
        onPostResponseScriptChange(data.script);
      }
      setAiDialogOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("scripts.aiGenerateFailed");
      setAiError(msg);
    } finally {
      setAiGenerating(false);
    }
  };

  const tabBarSx = {
    minHeight: 36,
    px: 1,
    borderBottom: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
    "& .MuiTab-root": {
      minHeight: 36,
      fontSize: "0.8rem",
    },
  };

  const activeIsPre = scriptTab === "pre";
  const activeScript = activeIsPre ? preRequestScript : postResponseScript;
  const activeTemplate = activeIsPre ? preTemplate : postTemplate;
  const activeHasOutput = activeIsPre
    ? hasPreOutput
    : (testResults.length > 0 || postLogs.length > 0);


  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1, height: "100%", minHeight: 0, overflow: "auto", p: 1 }}>
      {/* Language Toggle */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 0.5 }}>
        <ToggleButtonGroup
          value={scriptLanguage}
          exclusive
          onChange={(_, val) => val && onScriptLanguageChange(val)}
          size="small"
          sx={{
            height: 28,
            "& .MuiToggleButton-root": {
              fontSize: "0.7rem",
              fontWeight: 600,
              px: 1.5,
              py: 0,
              textTransform: "none",
              border: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
              "&.Mui-selected": {
                backgroundColor: alpha(theme.palette.primary.main, 0.12),
                color: theme.palette.primary.main,
                borderColor: alpha(theme.palette.primary.main, 0.3),
              },
            },
          }}
        >
          <ToggleButton value="javascript">
            <Box component="span" sx={{ fontFamily: "monospace", mr: 0.5 }}>JS</Box>
            JavaScript
          </ToggleButton>
          <ToggleButton value="python">
            <Box component="span" sx={{ fontFamily: "monospace", mr: 0.5 }}>PY</Box>
            Python
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title={t("scripts.docsTitle")}>
            <Box
              component="span"
              onClick={() => setDocsOpen(true)}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: "50%",
                cursor: "pointer",
                color: "text.secondary",
                "&:hover": { backgroundColor: alpha(theme.palette.action.hover, 0.08) },
              }}
            >
              <MenuBook sx={{ fontSize: 16 }} />
            </Box>
          </Tooltip>
        </Box>
      </Box>

      {/* Script Tabs */}
      <Tabs value={scriptTab} onChange={(_, v) => v && setScriptTab(v)} sx={tabBarSx}>
        <Tab
          value="pre"
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Terminal sx={{ fontSize: 16, color: theme.palette.primary.main }} />
              {t("scripts.preRequest")}
            </Box>
          }
        />
        <Tab
          value="post"
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Code sx={{ fontSize: 16, color: theme.palette.secondary.main }} />
              {t("scripts.postResponse")}
            </Box>
          }
        />
        <Tab
          value="output"
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Terminal sx={{ fontSize: 16, color: theme.palette.info.main }} />
              {t("scripts.output")}
            </Box>
          }
        />
      </Tabs>

      {scriptTab !== "output" && (
        <Box
          sx={{
            border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
            borderRadius: 2,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 180,
            flex: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.5, borderBottom: `1px solid ${alpha(theme.palette.divider, 0.08)}` }}>
            <Typography variant="caption" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: "0.06em", color: "text.secondary" }}>
              {activeIsPre ? t("scripts.preRequest") : t("scripts.postResponse")}
            </Typography>
            {activeIsPre && preRequestScript && (
              <Chip label={t("common.active")} size="small" color="primary" sx={{ height: 20, fontSize: 10 }} />
            )}
            {!activeIsPre && postResponseScript && (
              <Chip label={t("common.active")} size="small" color="secondary" sx={{ height: 20, fontSize: 10 }} />
            )}
            {!activeIsPre && testResults.length > 0 && (
              <>
                <Chip label={`${passedCount} ${t("common.passed")}`} size="small" color="success" sx={{ height: 20, fontSize: 10 }} />
                {failedCount > 0 && (
                  <Chip label={`${failedCount} ${t("common.failed")}`} size="small" color="error" sx={{ height: 20, fontSize: 10 }} />
                )}
              </>
            )}
            {activeIsPre && hasPreOutput && (
              <Chip label={`${preLogs.length} log${preLogs.length !== 1 ? "s" : ""}`} size="small" color="info" sx={{ height: 20, fontSize: 10 }} />
            )}
            <Box sx={{ ml: "auto" }} />
            <Tooltip title={t("scripts.aiGenerate")}>
              <Box
                component="span"
                onClick={() => openAiDialog(activeIsPre ? "pre-request" : "post-response")}
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  cursor: "pointer",
                  color: theme.palette.warning.main,
                  "&:hover": { backgroundColor: alpha(theme.palette.warning.main, 0.1) },
                }}
              >
                <AutoAwesome sx={{ fontSize: 16 }} />
              </Box>
            </Tooltip>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0 }}>
            <Editor
              height="100%"
              language={editorLang}
              theme={editorTheme}
              value={activeScript || activeTemplate}
              onChange={(v) => {
                const next = v ?? "";
                if (activeIsPre) onPreRequestScriptChange(next);
                else onPostResponseScriptChange(next);
              }}
              beforeMount={handleBeforeMount}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 12,
                wordWrap: "on",
                automaticLayout: true,
                lineNumbers: "on",
              }}
            />
          </Box>
        </Box>
      )}

      {scriptTab === "output" && (
        <Box
          sx={{
            border: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
            borderRadius: 2,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 180,
            flex: 1,
          }}
        >
          <Box sx={{ px: 1, py: 0.5, borderBottom: `1px solid ${alpha(theme.palette.divider, 0.08)}` }}>
            <Typography variant="caption" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: "0.06em", color: "text.secondary" }}>
              {t("scripts.output")}
            </Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: "auto", p: 1 }}>
            {hasPreOutput && (
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: "uppercase" }}>
                  {t("scripts.preRequest")}
                </Typography>
                {preErrors.length > 0 && (
                  <List dense disablePadding>
                    {preErrors.map((result, i) => (
                      <ListItem key={i} sx={{ py: 0.25 }}>
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          <Cancel color="error" sx={{ fontSize: 18 }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={result.name}
                          secondary={result.error}
                          primaryTypographyProps={{ variant: "body2", fontSize: 13 }}
                          secondaryTypographyProps={{
                            variant: "caption",
                            color: "error.main",
                            fontFamily: "monospace",
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
                {preLogs.length > 0 && (
                  <Box sx={{ mt: preErrors.length > 0 ? 1 : 0 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      {t("scripts.consoleLogs")}
                    </Typography>
                    {preLogs.map((log, i) => (
                      <Typography
                        key={i}
                        variant="body2"
                        sx={{ fontFamily: "monospace", fontSize: 12, color: "text.secondary" }}
                      >
                        {log}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            )}

            {(testResults.length > 0 || postLogs.length > 0) && (
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textTransform: "uppercase" }}>
                  {t("scripts.postResponse")}
                </Typography>
                {scriptResult && (
                  <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", mt: 0.5, mb: 0.75, flexWrap: "wrap" }}>
                    {testResults.length === 0 ? (
                      <Chip label={t("scripts.ran")} size="small" color="success" sx={{ height: 20, fontSize: 10 }} />
                    ) : failedCount === 0 ? (
                      <Chip label={t("scripts.allPassed")} size="small" color="success" sx={{ height: 20, fontSize: 10 }} />
                    ) : (
                      <Chip label={t("common.failed")} size="small" color="error" sx={{ height: 20, fontSize: 10 }} />
                    )}
                    {testResults.length > 0 && (
                      <>
                        <Chip label={`${passedCount} ${t("common.passed")}`} size="small" color="success" sx={{ height: 20, fontSize: 10 }} />
                        {failedCount > 0 && (
                          <Chip label={`${failedCount} ${t("common.failed")}`} size="small" color="error" sx={{ height: 20, fontSize: 10 }} />
                        )}
                      </>
                    )}
                  </Box>
                )}
                {testResults.length > 0 && (
                  <List dense disablePadding>
                    {testResults.map((result, i) => (
                      <ListItem key={i} sx={{ py: 0.25 }}>
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          {result.passed ? (
                            <CheckCircle color="success" sx={{ fontSize: 18 }} />
                          ) : (
                            <Cancel color="error" sx={{ fontSize: 18 }} />
                          )}
                        </ListItemIcon>
                        <ListItemText
                          primary={result.name}
                          secondary={result.error}
                          primaryTypographyProps={{ variant: "body2", fontSize: 13 }}
                          secondaryTypographyProps={{
                            variant: "caption",
                            color: "error.main",
                            fontFamily: "monospace",
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
                {postLogs.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      {t("scripts.consoleLogs")}
                    </Typography>
                    {postLogs.map((log, i) => (
                      <Typography
                        key={i}
                        variant="body2"
                        sx={{ fontFamily: "monospace", fontSize: 12, color: "text.secondary" }}
                      >
                        {log}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </Box>
        </Box>
      )}
      {/* ?? AI Script Generation Dialog ?? */}
      <Dialog open={aiDialogOpen} onClose={() => !aiGenerating && setAiDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AutoAwesome sx={{ color: theme.palette.warning.main }} />
          {t("scripts.aiGenerate")}
          <Chip
            label={aiDialogType === "pre-request" ? t("scripts.preRequest") : t("scripts.postResponse")}
            size="small"
            color={aiDialogType === "pre-request" ? "primary" : "secondary"}
            sx={{ ml: 1, height: 22, fontSize: "0.7rem" }}
          />
          <Chip
            label={isJS ? "JavaScript" : "Python"}
            size="small"
            variant="outlined"
            sx={{ height: 22, fontSize: "0.7rem", fontFamily: "monospace" }}
          />
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t("scripts.aiGenerateDescription")}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={4}
            placeholder={t("scripts.aiPlaceholder")}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            disabled={aiGenerating}
            sx={{
              "& .MuiOutlinedInput-root": { fontSize: "0.875rem" },
            }}
          />
          {aiError && (
            <Typography variant="caption" color="error" sx={{ mt: 1, display: "block" }}>
              {aiError}
            </Typography>
          )}

          {/* Quick suggestion chips */}
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: "block", mb: 1 }}>
              {t("scripts.quickSuggestions")}
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              {(aiDialogType === "pre-request"
                ? [
                    t("scripts.suggestTimestamp"),
                    t("scripts.suggestAuthToken"),
                    t("scripts.suggestUuid"),
                    t("scripts.suggestHmac"),
                  ]
                : [
                    t("scripts.suggestStatus200"),
                    t("scripts.suggestResponseTime"),
                    t("scripts.suggestJsonStructure"),
                    t("scripts.suggestFullValidation"),
                  ]
              ).map((suggestion) => (
                <Chip
                  key={suggestion}
                  label={suggestion}
                  size="small"
                  variant="outlined"
                  icon={<ContentPaste sx={{ fontSize: "14px !important" }} />}
                  onClick={() => setAiPrompt(suggestion)}
                  sx={{
                    fontSize: "0.72rem",
                    cursor: "pointer",
                    "&:hover": {
                      backgroundColor: alpha(theme.palette.primary.main, 0.08),
                      borderColor: theme.palette.primary.main,
                    },
                  }}
                />
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAiDialogOpen(false)} disabled={aiGenerating}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="contained"
            onClick={handleAiGenerate}
            disabled={!aiPrompt.trim() || aiGenerating}
            startIcon={aiGenerating ? <CircularProgress size={16} /> : <AutoAwesome />}
            sx={{ textTransform: "none" }}
          >
            {aiGenerating ? t("scripts.generating") : t("scripts.generate")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Documentation Drawer ── */}
      <Drawer
        anchor="right"
        open={docsOpen}
        onClose={() => setDocsOpen(false)}
        sx={{
          "& .MuiDrawer-paper": {
            width: 420,
            maxWidth: "90vw",
          },
        }}
      >
        <Box sx={{ p: 2.5, height: "100%", overflow: "auto" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Typography variant="h6" fontWeight={700} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <MenuBook sx={{ color: theme.palette.primary.main }} />
              {t("scripts.docsTitle")}
            </Typography>
            <Box
              component="span"
              onClick={() => setDocsOpen(false)}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: "50%",
                cursor: "pointer",
                "&:hover": { backgroundColor: alpha(theme.palette.action.hover, 0.08) },
              }}
            >
              <Close sx={{ fontSize: 18 }} />
            </Box>
          </Box>

          {/* Language indicator */}
          <Chip
            label={isJS ? "JavaScript" : "Python"}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ mb: 2, fontFamily: "monospace", fontWeight: 600 }}
          />

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {isJS ? t("scripts.docsIntroJs") : t("scripts.docsIntro")}
          </Typography>

          <Divider sx={{ my: 2 }} />

          {/* Commands section */}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            {t("scripts.docsCommands")}
          </Typography>

          <DocBlock
            title={isJS ? `req.test("name", expression)` : `req.test("name", expression)`}
            description={t("scripts.docsTestDesc")}
            example={
              isJS
                ? `req.test("Status is 200", req.response.status === 200);\nreq.test("Has users", req.response.json.data.length > 0);`
                : `req.test("Status is 200", req.response.status == 200)\nreq.test("Has users", len(req.response.json.data) > 0)`
            }
            isDark={isDark}
          />
          <DocBlock
            title={isJS ? `console.log(message)` : `req.log(message)`}
            description={isJS ? t("scripts.docsConsoleLogDesc") : t("scripts.docsLogDesc")}
            example={
              isJS
                ? `console.log("Status: " + String(req.response.status));\nconsole.log("Body length: " + String(req.response.body.length));`
                : `req.log("Status: " + str(req.response.status))\nreq.log("Body length: " + str(len(req.response.body)))`
            }
            isDark={isDark}
          />
          <DocBlock
            title={`req.variables.set(key, value)`}
            description={t("scripts.docsVarSetDesc")}
            example={
              isJS
                ? `req.variables.set("token", req.response.json.access_token);\nreq.variables.set("timestamp", String(Date.now()));`
                : `req.variables.set("token", req.response.json.access_token)\nreq.variables.set("timestamp", str(int(time.time())))`
            }
            isDark={isDark}
          />
          <DocBlock
            title={`req.globals.set(key, value)`}
            description={t("scripts.docsGlobalSetDesc")}
            example={`req.globals.set("baseUrl", "https://api.example.com")${isJS ? ";" : ""}`}
            isDark={isDark}
          />
          {!isJS && (
            <DocBlock
              title="assert expression"
              description={t("scripts.docsAssertDesc")}
              example={`assert req.response.status == 200\nassert len(req.response.body) > 0`}
              isDark={isDark}
            />
          )}
          <DocBlock
            title={isJS ? `let variable = expression` : `variable = expression`}
            description={t("scripts.docsAssignDesc")}
            example={
              isJS
                ? `let userId = req.response.json.id;\nlet token = "Bearer " + req.response.json.token;`
                : `userId = req.response.json.id\ntoken = "Bearer " + req.response.json.token`
            }
            isDark={isDark}
          />

          <Divider sx={{ my: 2 }} />

          {/* Response access */}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            {t("scripts.docsResponse")}
          </Typography>

          <DocBlock
            title="req.response.status"
            description={t("scripts.docsStatusDesc")}
            example={isJS
              ? `req.test("OK", req.response.status === 200);`
              : `req.test("OK", req.response.status == 200)`}
            isDark={isDark}
          />
          <DocBlock
            title="req.response.body"
            description={t("scripts.docsBodyDesc")}
            example={isJS
              ? `req.test("Not empty", req.response.body.length > 0);`
              : `req.test("Not empty", len(req.response.body) > 0)`}
            isDark={isDark}
          />
          <DocBlock
            title="req.response.json / req.response.json.field"
            description={t("scripts.docsJsonDesc")}
            example={isJS
              ? `req.test("Has name", req.response.json.name !== null);\nreq.test("Is admin", req.response.json.user.role === "admin");`
              : `req.test("Has name", req.response.json.name != None)\nreq.test("Is admin", req.response.json.user.role == "admin")`}
            isDark={isDark}
          />
          <DocBlock
            title={`req.response.headers["Name"]`}
            description={t("scripts.docsHeadersDesc")}
            example={isJS
              ? `req.test("JSON type", req.response.headers["content-type"] === "application/json");`
              : `req.test("JSON type", req.response.headers["content-type"] == "application/json")`}
            isDark={isDark}
          />
          <DocBlock
            title="req.response.time"
            description={t("scripts.docsTimeDesc")}
            example={isJS
              ? `req.test("Fast", req.response.time < 500);`
              : `req.test("Fast", req.response.time < 500)`}
            isDark={isDark}
          />

          <Divider sx={{ my: 2 }} />

          {/* Built-in functions */}
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            {t("scripts.docsBuiltins")}
          </Typography>

          <Box sx={{
            fontFamily: "monospace",
            fontSize: "0.75rem",
            p: 1.5,
            borderRadius: 1.5,
            backgroundColor: alpha(isDark ? "#fff" : "#000", 0.04),
            color: "text.secondary",
            lineHeight: 1.8,
          }}>
            {isJS ? (
              <>
                <strong>{t("scripts.docsFunctions")}:</strong> parseInt(), parseFloat(), String(), Number(), Boolean(), typeof, Array.isArray()<br /><br />
                <strong>{t("scripts.docsMethods")}:</strong> .length, .includes(), .startsWith(), .endsWith(), .trim(), .toUpperCase(), .toLowerCase()<br /><br />
                <strong>{t("scripts.docsObjects")}:</strong> JSON.parse(), JSON.stringify(), Math.abs(), Math.round(), Math.min(), Math.max(), Date.now()<br /><br />
                <strong>{t("scripts.docsOperators")}:</strong> ===, !==, &&, ||, !<br /><br />
                <strong>{t("scripts.docsComments")}:</strong> //
              </>
            ) : (
              <>
                <strong>{t("scripts.docsFunctions")}:</strong> len(), str(), int(), float(), bool(), abs(), min(), max(), sum(), round(), sorted(), range(), any(), all(), isinstance()<br /><br />
                <strong>{t("scripts.docsModules")}:</strong> json, re, time<br /><br />
                <strong>{t("scripts.docsComments")}:</strong> // {t("scripts.docsOr")} #
              </>
            )}
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}

/* ── Documentation Block helper ── */
function DocBlock({
  title,
  description,
  example,
  isDark,
}: {
  title: string;
  description: string;
  example: string;
  isDark: boolean;
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography
        variant="body2"
        fontWeight={600}
        sx={{
          fontFamily: "monospace",
          fontSize: "0.8rem",
          color: isDark ? "#93c5fd" : "#2563eb",
        }}
      >
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25, mb: 0.5 }}>
        {description}
      </Typography>
      <Box
        sx={{
          fontFamily: "monospace",
          fontSize: "0.72rem",
          p: 1,
          borderRadius: 1,
          backgroundColor: alpha(isDark ? "#fff" : "#000", 0.04),
          border: `1px solid ${alpha(isDark ? "#fff" : "#000", 0.06)}`,
          whiteSpace: "pre-wrap",
          color: "text.secondary",
          lineHeight: 1.6,
        }}
      >
        {example}
      </Box>
    </Box>
  );
}
