import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  LinearProgress,
  Alert,
  Chip,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  ToggleButtonGroup,
  ToggleButton,
  Checkbox,
  IconButton,
  Fade,
  Paper,
  Collapse,
  CircularProgress,
  FormControlLabel,
  Switch,
} from "@mui/material";
import {
  AutoAwesome,
  Check,
  Description,
  Language,
  PlayArrow,
  Close,
  CheckCircle,
  RadioButtonUnchecked,
  TravelExplore,
  DataObject,
  SelectAll,
  Deselect,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { aiApi, proxyApi, appSettingsApi } from "@/api/endpoints";
import type { GeneratedEndpointFull, ProxyResponse, HttpMethod } from "@/types";

const METHOD_COLORS: Record<string, string> = {
  GET: "#34d399",
  POST: "#fbbf24",
  PUT: "#818cf8",
  PATCH: "#f472b6",
  DELETE: "#f87171",
  HEAD: "#38bdf8",
  OPTIONS: "#a78bfa",
};

interface AICollectionWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  workspaceId: string | null;
}

type Step = "input" | "generating" | "preview" | "creating" | "done";
type SourceMode = "docs" | "url";

export default function AICollectionWizard({
  open,
  onClose,
  onComplete,
  workspaceId,
}: AICollectionWizardProps) {
  const { t } = useTranslation();

  // ── AI Provider state ──
  const [aiProvider, setAiProvider] = useState<"openai" | "ollama">("openai");

  // Load AI provider on mount
  useEffect(() => {
    appSettingsApi
      .get()
      .then(({ data }) => {
        setAiProvider(data.ai_provider || "openai");
      })
      .catch(() => {});
  }, []);

  const isOllama = aiProvider === "ollama";

  // ── Core state ──
  const [step, setStep] = useState<Step>("input");
  const [sourceMode, setSourceMode] = useState<SourceMode>("docs");
  const [collectionNameInput, setCollectionNameInput] = useState("");
  const [documentation, setDocumentation] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [useFolders, setUseFolders] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Generating state ──
  const [researchActive, setResearchActive] = useState(false);
  const [researchDone, setResearchDone] = useState(false);
  const [extractActive, setExtractActive] = useState(false);
  const [extractDone, setExtractDone] = useState(false);
  const [aiOutput, setAiOutput] = useState("");
  const [aiOutputKey, setAiOutputKey] = useState(0);
  const [researchChars, setResearchChars] = useState(0);

  // ── Preview state ──
  const [endpoints, setEndpoints] = useState<GeneratedEndpointFull[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // ── Test state ──
  const [testIdx, setTestIdx] = useState<number | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<ProxyResponse | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // ── Reset ──
  const handleReset = () => {
    setStep("input");
    setCollectionNameInput("");
    setDocumentation("");
    setSourceUrl("");
    setCustomInstructions("");
    setUseFolders(true);
    setError(null);
    setResearchActive(false);
    setResearchDone(false);
    setExtractActive(false);
    setExtractDone(false);
    setAiOutput("");
    setAiOutputKey(0);
    setResearchChars(0);
    setEndpoints([]);
    setSelected(new Set());
    setTestIdx(null);
    setTestResult(null);
  };

  const handleClose = () => {
    if (abortRef.current) abortRef.current.abort();
    handleReset();
    setSourceMode("docs");
    onClose();
  };

  const effectiveSourceMode = isOllama ? "docs" : sourceMode;
  const isInputValid =
    (effectiveSourceMode === "docs" ? documentation.trim() : sourceUrl.trim());

  // ── Start generation with SSE streaming ──
  const handleGenerate = useCallback(() => {
    if (!isInputValid) return;

    const nameParts = collectionNameInput
      .split(/[,\n]/)
      .map((part) => part.trim())
      .filter(Boolean);
    const collectionName = nameParts.length === 1 ? nameParts[0] : undefined;
    const collectionNames = nameParts.length > 0 ? nameParts : undefined;
    const instructions = customInstructions.trim() || undefined;

    setStep("generating");
    setError(null);
    setResearchActive(false);
    setResearchDone(false);
    setExtractActive(false);
    setExtractDone(false);
    setAiOutput("");
    setResearchChars(0);

    const ctrl = aiApi.streamGenerate(
      {
        collection_name: collectionName,
        collection_names: collectionNames,
        custom_instructions: instructions,
        workspace_id: workspaceId ?? undefined,
        ...(effectiveSourceMode === "docs"
          ? { documentation: documentation.trim() }
          : { source_url: sourceUrl.trim() }),
      },
      {
        onStep: (phase, status) => {
          if (phase === "research") {
            if (status === "active") setResearchActive(true);
            if (status === "done") {
              setResearchActive(false);
              setResearchDone(true);
            }
            if (status === "skipped") {
              setResearchDone(true);
            }
          }
          if (phase === "extract") {
            if (status === "active") setExtractActive(true);
            if (status === "done") {
              setExtractActive(false);
              setExtractDone(true);
            }
          }
        },
        onAiOutput: (text, _type, chars) => {
          setAiOutput(text);
          setAiOutputKey((k) => k + 1);
          if (chars) setResearchChars(chars);
        },
        onEndpoints: (eps, _total) => {
          setEndpoints(eps);
          setSelected(new Set(eps.map((_, i) => i)));
          setStep("preview");
        },
        onError: (msg) => {
          setError(msg);
          setStep("input");
        },
        onDone: () => {
          // endpoints event triggers step change
        },
      },
    );
    abortRef.current = ctrl;
  }, [
    isInputValid,
    collectionNameInput,
    customInstructions,
    workspaceId,
    effectiveSourceMode,
    documentation,
    sourceUrl,
  ]);

  // ── Create collection from selected endpoints ──
  const handleCreate = async () => {
    const selectedEps = endpoints.filter((_, i) => selected.has(i));
    if (selectedEps.length === 0) return;

    const nameParts = collectionNameInput
      .split(/[,\n]/)
      .map((part) => part.trim())
      .filter(Boolean);
    const collectionName = nameParts.length === 1 ? nameParts[0] : undefined;
    const collectionNames = nameParts.length > 0 ? nameParts : undefined;

    setStep("creating");
    try {
      await aiApi.createFromEndpoints({
        collection_name: collectionName,
        collection_names: collectionNames,
        use_folders: useFolders,
        workspace_id: workspaceId ?? undefined,
        source_url: effectiveSourceMode === "url" ? sourceUrl.trim() : undefined,
        endpoints: selectedEps,
      });
      setStep("done");
      onComplete();
      setTimeout(() => handleClose(), 1500);
    } catch {
      setError(t("common.error"));
      setStep("preview");
    }
  };

  // ── Test endpoint ──
  const handleTest = async (idx: number) => {
    const ep = endpoints[idx];
    if (!ep) return;
    setTestIdx(idx);
    setTestLoading(true);
    setTestResult(null);
    try {
      const { data } = await proxyApi.send({
        method: ep.method as HttpMethod,
        url: ep.url,
        headers: ep.headers,
        query_params: ep.query_params,
        body: ep.body || undefined,
      });
      setTestResult(data);
    } catch {
      setTestResult({ status_code: 0, headers: {}, body: "Request failed", elapsed_ms: 0, size_bytes: 0, is_binary: false, content_type: "", pre_request_result: null, script_result: null });
    } finally {
      setTestLoading(false);
    }
  };

  // ── Selection helpers ──
  const toggleSelect = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(endpoints.map((_, i) => i)));
  const deselectAll = () => setSelected(new Set());
  const allSelected = endpoints.length > 0 && selected.size === endpoints.length;
  const collectionNames = Array.from(
    new Set(
      endpoints
        .map((ep) => ep.collection?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const showCollectionColumn = collectionNames.length > 0;

  // ── Step icon ──
  const StepIcon = ({ active, done }: { active: boolean; done: boolean }) => {
    if (done) return <CheckCircle sx={{ color: "success.main", fontSize: 28 }} />;
    if (active)
      return (
        <CircularProgress
          size={24}
          thickness={5}
          sx={{ color: "warning.main" }}
        />
      );
    return <RadioButtonUnchecked sx={{ color: "text.disabled", fontSize: 28 }} />;
  };

  return (
    <Dialog
      open={open}
      onClose={step === "generating" || step === "creating" ? undefined : handleClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <AutoAwesome color="warning" />
        {t("ai.wizardTitle")}
        <Chip label="BETA" size="small" color="warning" sx={{ fontSize: 10, height: 20, fontWeight: 700 }} />
      </DialogTitle>

      <DialogContent>
        {/* ── INPUT STEP ── */}
        {step === "input" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

            <Typography variant="body2" color="text.secondary">
              {t("ai.wizardDescription")}
            </Typography>

            <TextField
              size="small"
              label={t("ai.collectionNames")}
              value={collectionNameInput}
              onChange={(e) => setCollectionNameInput(e.target.value)}
              placeholder="GitHub API, Stripe API..."
              helperText={t("ai.collectionNamesHint")}
              autoFocus
            />

            <FormControlLabel
              control={
                <Switch
                  checked={useFolders}
                  onChange={(e) => setUseFolders(e.target.checked)}
                  size="small"
                />
              }
              label={t("ai.useFolders")}
              sx={{ alignSelf: "flex-start" }}
            />

            <TextField
              multiline
              minRows={3}
              maxRows={6}
              label={t("ai.customInstructions")}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder={t("ai.customInstructionsPlaceholder")}
              helperText={t("ai.customInstructionsHint")}
              InputProps={{ sx: { fontFamily: "monospace", fontSize: 12 } }}
            />

            <ToggleButtonGroup
              value={isOllama ? "docs" : sourceMode}
              exclusive
              onChange={(_, v) => v && !isOllama && setSourceMode(v)}
              size="small"
              sx={{ alignSelf: "flex-start" }}
            >
              <ToggleButton value="docs" sx={{ gap: 0.5, textTransform: "none", px: 2 }}>
                <Description fontSize="small" />
                {t("ai.sourceDocs")}
              </ToggleButton>
              <ToggleButton value="url" disabled={isOllama} sx={{ gap: 0.5, textTransform: "none", px: 2 }}>
                <Language fontSize="small" />
                {t("ai.sourceUrl")}
              </ToggleButton>
            </ToggleButtonGroup>

            {isOllama && (
              <Alert severity="info" variant="outlined" sx={{ fontSize: 13 }}>
                {t("ai.urlDisabledOllama")}
              </Alert>
            )}

            {effectiveSourceMode === "docs" ? (
              <TextField
                multiline
                minRows={12}
                maxRows={20}
                label={t("ai.pasteDocumentation")}
                value={documentation}
                onChange={(e) => setDocumentation(e.target.value)}
                placeholder={t("ai.documentationPlaceholder")}
                InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }}
              />
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <TextField
                  size="small"
                  label={t("ai.sourceUrl")}
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://docs.example.com/api"
                  InputProps={{ sx: { fontFamily: "monospace", fontSize: 13 } }}
                />
                <Alert severity="info" variant="outlined" sx={{ fontSize: 13 }}>
                  {t("ai.urlDescription")}
                </Alert>
              </Box>
            )}
          </Box>
        )}

        {/* ── GENERATING STEP ── */}
        {step === "generating" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 2 }}>
            {/* Stepper */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {/* Step 1: Research */}
              {effectiveSourceMode === "url" && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <StepIcon active={researchActive} done={researchDone} />
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      variant="body1"
                      fontWeight={researchActive ? 600 : 400}
                      color={researchDone ? "success.main" : researchActive ? "text.primary" : "text.disabled"}
                    >
                      <TravelExplore sx={{ fontSize: 18, mr: 0.5, verticalAlign: "text-bottom" }} />
                      {t("ai.stepResearch")}
                    </Typography>
                    {researchActive && researchChars > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        {t("ai.charsCollected", { chars: researchChars.toLocaleString() })}
                      </Typography>
                    )}
                  </Box>
                </Box>
              )}

              {/* Step 2: Extract */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <StepIcon active={extractActive} done={extractDone} />
                <Typography
                  variant="body1"
                  fontWeight={extractActive ? 600 : 400}
                  color={extractDone ? "success.main" : extractActive ? "text.primary" : "text.disabled"}
                >
                  <DataObject sx={{ fontSize: 18, mr: 0.5, verticalAlign: "text-bottom" }} />
                  {t("ai.stepExtract")}
                </Typography>
              </Box>
            </Box>

            {/* AI Output Card */}
            {aiOutput && (
              <Fade in key={aiOutputKey} timeout={400}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    bgcolor: "action.hover",
                    borderLeft: 3,
                    borderLeftColor: "warning.main",
                    minHeight: 60,
                  }}
                >
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    {t("ai.aiOutput")}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {aiOutput}
                  </Typography>
                </Paper>
              </Fade>
            )}

            <LinearProgress
              variant={researchActive ? "indeterminate" : extractActive ? "indeterminate" : "determinate"}
              value={extractDone ? 100 : researchDone ? 60 : 20}
              sx={{ borderRadius: 1 }}
            />
          </Box>
        )}

        {/* ── PREVIEW STEP ── */}
        {step === "preview" && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Alert severity="success" sx={{ flex: 1 }}>
                {t("ai.generated", { count: endpoints.length })}
                {selected.size < endpoints.length && (
                  <Typography component="span" variant="body2" ml={1}>
                    ({t("ai.selectedCount", { count: selected.size })})
                  </Typography>
                )}
                {showCollectionColumn && (
                  <Typography component="div" variant="caption" color="text.secondary" mt={0.5}>
                    {t("collection.collection")}: {collectionNames.join(", ")}
                  </Typography>
                )}
              </Alert>
              <Box sx={{ display: "flex", gap: 0.5, ml: 1 }}>
                <IconButton size="small" onClick={selectAll} title={t("ai.selectAll")}>
                  <SelectAll fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={deselectAll} title={t("ai.deselectAll")}>
                  <Deselect fontSize="small" />
                </IconButton>
              </Box>
            </Box>

            <TableContainer
              sx={{ border: 1, borderColor: "divider", borderRadius: 1, maxHeight: 400, overflow: "auto" }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" sx={{ bgcolor: "action.hover" }}>
                      <Checkbox
                        size="small"
                        checked={allSelected}
                        indeterminate={selected.size > 0 && !allSelected}
                        onChange={allSelected ? deselectAll : selectAll}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, bgcolor: "action.hover", width: 90 }}>
                      {t("request.method")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, bgcolor: "action.hover" }}>
                      {t("common.name")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, bgcolor: "action.hover" }}>URL</TableCell>
                    {showCollectionColumn && (
                      <TableCell sx={{ fontWeight: 600, bgcolor: "action.hover", width: 140 }}>
                        {t("collection.collection")}
                      </TableCell>
                    )}
                    <TableCell sx={{ fontWeight: 600, bgcolor: "action.hover", width: 100 }}>
                      {t("ai.folder")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, bgcolor: "action.hover", width: 50 }} align="center">
                      {t("ai.test")}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {endpoints.map((ep, i) => (
                    <TableRow
                      key={i}
                      sx={{
                        "&:hover": { bgcolor: "action.hover" },
                        opacity: selected.has(i) ? 1 : 0.45,
                        transition: "opacity 0.2s",
                      }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox size="small" checked={selected.has(i)} onChange={() => toggleSelect(i)} />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={ep.method}
                          size="small"
                          sx={{
                            fontWeight: 700,
                            fontSize: 11,
                            bgcolor: METHOD_COLORS[ep.method] ?? "#888",
                            color: "#000",
                            height: 22,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontSize={13}>{ep.name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace" fontSize={12} noWrap>
                          {ep.url}
                        </Typography>
                      </TableCell>
                      {showCollectionColumn && (
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {ep.collection || "-"}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">{ep.folder || "-"}</Typography>
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleTest(i)}
                          disabled={testLoading && testIdx === i}
                        >
                          {testLoading && testIdx === i ? (
                            <CircularProgress size={16} />
                          ) : (
                            <PlayArrow fontSize="small" />
                          )}
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Test Result Panel */}
            <Collapse in={testIdx !== null && testResult !== null}>
              {testResult && testIdx !== null && (
                <Paper variant="outlined" sx={{ p: 2, position: "relative" }}>
                  <IconButton
                    size="small"
                    onClick={() => { setTestIdx(null); setTestResult(null); }}
                    sx={{ position: "absolute", top: 4, right: 4 }}
                  >
                    <Close fontSize="small" />
                  </IconButton>
                  <Typography variant="subtitle2" gutterBottom>
                    {t("ai.testResult")} — {endpoints[testIdx]?.name}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 2, mb: 1 }}>
                    <Chip
                      label={`${testResult.status_code}`}
                      size="small"
                      color={testResult.status_code >= 200 && testResult.status_code < 300 ? "success" : "error"}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {testResult.elapsed_ms}ms / {testResult.size_bytes} bytes
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      maxHeight: 150,
                      overflow: "auto",
                      bgcolor: "action.hover",
                      borderRadius: 1,
                      p: 1,
                    }}
                  >
                    <Typography
                      component="pre"
                      variant="body2"
                      sx={{ fontFamily: "monospace", fontSize: 11, whiteSpace: "pre-wrap", m: 0 }}
                    >
                      {testResult.body?.slice(0, 2000) || "(empty)"}
                    </Typography>
                  </Box>
                </Paper>
              )}
            </Collapse>
          </Box>
        )}

        {/* ── CREATING STEP ── */}
        {step === "creating" && (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, py: 6 }}>
            <CircularProgress size={48} color="warning" />
            <Typography variant="h6">{t("ai.creating")}</Typography>
          </Box>
        )}

        {/* ── DONE STEP ── */}
        {step === "done" && (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, py: 6 }}>
            <Check sx={{ fontSize: 48, color: "success.main" }} />
            <Typography variant="h6">{t("ai.done")}</Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        {step === "input" && (
          <>
            <Button onClick={handleClose}>{t("common.cancel")}</Button>
            <Button
              variant="contained"
              onClick={handleGenerate}
              disabled={!isInputValid}
              startIcon={<AutoAwesome />}
            >
              {t("ai.generate")}
            </Button>
          </>
        )}

        {step === "generating" && (
          <Button onClick={handleClose} color="inherit">
            {t("common.cancel")}
          </Button>
        )}

        {step === "preview" && (
          <>
            {error && <Alert severity="error" sx={{ mr: "auto", py: 0 }}>{error}</Alert>}
            <Button onClick={handleReset}>{t("ai.startOver")}</Button>
            <Button
              variant="contained"
              onClick={handleCreate}
              color="success"
              disabled={selected.size === 0}
            >
              {t("ai.confirmCreate")} ({selected.size})
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
