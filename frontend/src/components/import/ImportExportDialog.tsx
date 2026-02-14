import { useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tabs,
  Tab,
  Box,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Stepper,
  Step,
  StepLabel,
  LinearProgress,
  Tooltip,
} from "@mui/material";
import {
  Upload,
  ContentPaste,
  SwapHoriz,
  Api,
  Terminal,
  FileDownload,
  CheckCircle,
  Warning,
  ArrowBack,
  ArrowForward,
  CloudUpload,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { alpha, useTheme } from "@mui/material/styles";
import { importExportApi } from "@/api/endpoints";
import type {
  Collection,
  PostmanImportPreview,
  PostmanImportResult,
  EnvironmentType,
} from "@/types";

type PostmanStep = "files" | "preview" | "importing" | "result";

interface ImportExportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  workspaceId: string | null;
  collections: Collection[];
  onExportCollection: (collectionId: string) => void;
}

export default function ImportExportDialog({
  open,
  onClose,
  onImported,
  workspaceId,
  collections,
  onExportCollection,
}: ImportExportDialogProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [mainTab, setMainTab] = useState(0);
  const [importTab, setImportTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [curlInput, setCurlInput] = useState("");
  const [curlName, setCurlName] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");

  // Postman wizard state
  const [pmStep, setPmStep] = useState<PostmanStep>("files");
  const [collectionFile, setCollectionFile] = useState<File | null>(null);
  const [envFiles, setEnvFiles] = useState<File[]>([]);
  const [globalsFile, setGlobalsFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<PostmanImportPreview | null>(null);
  const [envTypeOverrides, setEnvTypeOverrides] = useState<Record<string, EnvironmentType>>({});
  const [importResult, setImportResult] = useState<PostmanImportResult | null>(null);
  const [draggingOver, setDraggingOver] = useState<string | null>(null);

  const collectionInputRef = useRef<HTMLInputElement>(null);
  const envInputRef = useRef<HTMLInputElement>(null);
  const globalsInputRef = useRef<HTMLInputElement>(null);

  const resetPostmanWizard = useCallback(() => {
    setPmStep("files");
    setCollectionFile(null);
    setEnvFiles([]);
    setGlobalsFile(null);
    setImportPreview(null);
    setEnvTypeOverrides({});
    setImportResult(null);
    setDraggingOver(null);
  }, []);

  const handleOpenApiImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.yaml,.yml";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const { data } = await importExportApi.importOpenApi(file, workspaceId ?? undefined);
        setSuccess(t("import.success", { name: data.collection_name, count: data.total_requests }));
        onImported();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t("import.failed"));
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  const handleCurlImport = async () => {
    if (!curlInput.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { data } = await importExportApi.importCurl(curlInput, curlName || undefined);
      setSuccess(t("import.curlSuccess", { name: data.name }));
      setCurlInput("");
      setCurlName("");
      onImported();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("import.curlFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!selectedCollectionId) return;
    onExportCollection(selectedCollectionId);
    setSuccess(t("collection.exportSuccess"));
  };

  const handleClose = () => {
    setError(null);
    setSuccess(null);
    setCurlInput("");
    setCurlName("");
    setSelectedCollectionId("");
    setMainTab(0);
    setImportTab(0);
    resetPostmanWizard();
    onClose();
  };

  // ── Postman wizard handlers ──

  const handlePreview = async () => {
    if (!collectionFile) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await importExportApi.previewPostmanImport(
        collectionFile,
        envFiles,
        globalsFile || undefined,
      );
      setImportPreview(data);
      const overrides: Record<string, EnvironmentType> = {};
      data.environments.forEach((env) => {
        overrides[env.filename] = env.detected_type;
      });
      setEnvTypeOverrides(overrides);
      setPmStep("preview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("import.failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleFullImport = async () => {
    if (!collectionFile || !workspaceId) return;
    setPmStep("importing");
    setError(null);
    try {
      const { data } = await importExportApi.importPostmanFull(
        collectionFile,
        workspaceId,
        envFiles,
        globalsFile || undefined,
        Object.keys(envTypeOverrides).length > 0 ? envTypeOverrides : undefined,
      );
      setImportResult(data);
      setPmStep("result");
      onImported();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("import.failed"));
      setPmStep("preview");
    }
  };

  const handleDrop = (zone: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(null);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith(".json"));
    if (!files.length) return;

    if (zone === "collection" && files[0]) {
      setCollectionFile(files[0]);
    } else if (zone === "env") {
      setEnvFiles((prev) => [...prev, ...files]);
    } else if (zone === "globals" && files[0]) {
      setGlobalsFile(files[0]);
    }
  };

  const handleDragOver = (zone: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(zone);
  };

  const stepIndex = pmStep === "files" ? 0 : pmStep === "preview" ? 1 : pmStep === "importing" ? 2 : 3;
  const stepLabels = [
    t("postmanImport.stepFiles"),
    t("postmanImport.stepPreview"),
    t("postmanImport.stepImport"),
    t("postmanImport.stepResult"),
  ];

  // ── Drop Zone component ──
  const DropZone = ({
    zone,
    title,
    description,
    hint,
    required,
    multiple,
    files: zoneFiles,
    inputRef,
    onFileChange,
    onRemove,
  }: {
    zone: string;
    title: string;
    description: string;
    hint: string;
    required?: boolean;
    multiple?: boolean;
    files: File[];
    inputRef: React.RefObject<HTMLInputElement | null>;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemove?: (idx: number) => void;
  }) => {
    const hasFiles = zoneFiles.length > 0;
    return (
      <Box
        onDragOver={handleDragOver(zone)}
        onDragLeave={() => setDraggingOver(null)}
        onDrop={handleDrop(zone)}
        onClick={() => inputRef.current?.click()}
        sx={{
          p: 2,
          borderRadius: 1.5,
          cursor: "pointer",
          border: `1px dashed ${
            hasFiles
              ? theme.palette.success.main
              : draggingOver === zone
                ? theme.palette.primary.main
                : theme.palette.divider
          }`,
          bgcolor: draggingOver === zone
            ? alpha(theme.palette.primary.main, 0.04)
            : hasFiles
              ? alpha(theme.palette.success.main, 0.04)
              : "transparent",
          transition: "all 0.15s",
          "&:hover": {
            borderColor: hasFiles ? theme.palette.success.main : theme.palette.primary.main,
            bgcolor: hasFiles
              ? alpha(theme.palette.success.main, 0.06)
              : alpha(theme.palette.action.hover, 0.5),
          },
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          multiple={multiple}
          hidden
          onChange={onFileChange}
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.3 }}>
              <Typography variant="body2" fontWeight={600}>
                {title}
              </Typography>
              {required ? (
                <Chip
                  label={t("postmanImport.required")}
                  size="small"
                  color="error"
                  sx={{ height: 18, fontSize: "0.65rem" }}
                />
              ) : (
                <Chip
                  label={multiple ? t("postmanImport.multiple") : t("postmanImport.optional")}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: "0.65rem" }}
                />
              )}
            </Box>
            {hasFiles ? (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                {zoneFiles.map((f, idx) => (
                  <Chip
                    key={idx}
                    label={f.name}
                    size="small"
                    color="success"
                    variant="outlined"
                    onDelete={
                      onRemove
                        ? (e) => {
                            e.stopPropagation();
                            onRemove(idx);
                          }
                        : undefined
                    }
                    sx={{ maxWidth: 260, height: 22, fontSize: "0.75rem" }}
                  />
                ))}
              </Box>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.78rem" }}>
                  {description}
                </Typography>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.7rem" }}>
                  {hint}
                </Typography>
              </>
            )}
          </Box>
          {hasFiles && <CheckCircle sx={{ fontSize: 20, color: "success.main" }} />}
        </Box>
      </Box>
    );
  };

  // ── Render Postman wizard content ──
  const renderPostmanWizard = () => {
    if (pmStep === "files") {
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          <DropZone
            zone="collection"
            title={t("postmanImport.collectionFile")}
            description={t("postmanImport.collectionFileDesc")}
            hint={t("postmanImport.collectionFileHint")}
            required
            files={collectionFile ? [collectionFile] : []}
            inputRef={collectionInputRef}
            onFileChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setCollectionFile(f);
              e.target.value = "";
            }}
          />

          <DropZone
            zone="env"
            title={t("postmanImport.environmentFiles")}
            description={t("postmanImport.environmentFilesDesc")}
            hint={t("postmanImport.environmentFilesHint")}
            multiple
            files={envFiles}
            inputRef={envInputRef}
            onFileChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length) setEnvFiles((prev) => [...prev, ...files]);
              e.target.value = "";
            }}
            onRemove={(idx) => setEnvFiles((prev) => prev.filter((_, i) => i !== idx))}
          />

          <DropZone
            zone="globals"
            title={t("postmanImport.globalsFile")}
            description={t("postmanImport.globalsFileDesc")}
            hint={t("postmanImport.globalsFileHint")}
            files={globalsFile ? [globalsFile] : []}
            inputRef={globalsInputRef}
            onFileChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setGlobalsFile(f);
              e.target.value = "";
            }}
          />

          <Button
            variant="contained"
            onClick={handlePreview}
            disabled={!collectionFile || loading}
            startIcon={loading ? <CircularProgress size={16} /> : <ArrowForward />}
            sx={{ mt: 1 }}
          >
            {loading ? t("postmanImport.analyzing") : t("postmanImport.analyzePreview")}
          </Button>
        </Box>
      );
    }

    if (pmStep === "preview" && importPreview) {
      const preview = importPreview;
      const providedSet = new Set(preview.variables_provided);

      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {/* Collection Summary */}
          <Box sx={{ p: 2, borderRadius: 1.5, border: 1, borderColor: "divider" }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              {t("postmanImport.collectionSummary", { name: preview.collection.name })}
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              <Chip
                label={t("postmanImport.requestCount", {
                  count: preview.collection.total_requests,
                  folders: preview.collection.total_folders,
                })}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ height: 22, fontSize: "0.75rem" }}
              />
              {preview.collection.request_scripts_count > 0 && (
                <Chip
                  label={t("postmanImport.scriptsFound", {
                    count: preview.collection.request_scripts_count,
                  })}
                  size="small"
                  color="info"
                  variant="outlined"
                  sx={{ height: 22, fontSize: "0.75rem" }}
                />
              )}
              {preview.collection.collection_variables_count > 0 && (
                <Chip
                  label={t("postmanImport.collectionVariables", {
                    count: preview.collection.collection_variables_count,
                  })}
                  size="small"
                  variant="outlined"
                  sx={{ height: 22, fontSize: "0.75rem" }}
                />
              )}
            </Box>
          </Box>

          {/* Environments */}
          {preview.environments.length > 0 && (
            <Box sx={{ p: 2, borderRadius: 1.5, border: 1, borderColor: "divider" }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                {t("postmanImport.environmentsToCreate")}
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {preview.environments.map((env) => (
                  <Box
                    key={env.filename}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 2,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600}>
                        {env.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t("postmanImport.variablesCount", { count: env.variables_count })}
                      </Typography>
                    </Box>
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <Select
                        value={envTypeOverrides[env.filename] || env.detected_type}
                        onChange={(e) => {
                          setEnvTypeOverrides((prev) => ({
                            ...prev,
                            [env.filename]: e.target.value as EnvironmentType,
                          }));
                        }}
                        onClick={(e) => e.stopPropagation()}
                        sx={{ fontSize: "0.8rem" }}
                      >
                        <MenuItem value="LIVE">LIVE</MenuItem>
                        <MenuItem value="TEST">TEST</MenuItem>
                        <MenuItem value="DEV">DEV</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* Globals */}
          {preview.globals && (
            <Box sx={{ p: 2, borderRadius: 1.5, border: 1, borderColor: "divider", display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                {t("postmanImport.globalsToCreate")}
              </Typography>
              <Chip
                label={t("postmanImport.globalsSummary", {
                  count: preview.globals.variables_count,
                })}
                size="small"
                variant="outlined"
                sx={{ height: 22, fontSize: "0.75rem" }}
              />
            </Box>
          )}

          {/* Variable Crosscheck */}
          {preview.variables_used_in_collection.length > 0 && (
            <Box sx={{ p: 2, borderRadius: 1.5, border: 1, borderColor: "divider" }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                {t("postmanImport.variablesUsed")}
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {preview.variables_used_in_collection.map((v) => {
                  const provided = providedSet.has(v);
                  return (
                    <Tooltip
                      key={v}
                      title={
                        provided
                          ? t("postmanImport.variableProvided")
                          : t("postmanImport.variableMissing")
                      }
                    >
                      <Chip
                        icon={
                          provided ? (
                            <CheckCircle sx={{ fontSize: 14 }} />
                          ) : (
                            <Warning sx={{ fontSize: 14 }} />
                          )
                        }
                        label={`{{${v}}}`}
                        size="small"
                        color={provided ? "success" : "warning"}
                        variant="outlined"
                        sx={{ fontFamily: "monospace", fontSize: "0.75rem", height: 22 }}
                      />
                    </Tooltip>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* Workspace warning */}
          {!workspaceId && (
            <Alert severity="warning">{t("workspace.createFirst")}</Alert>
          )}

          {/* Action buttons */}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<ArrowBack />}
              onClick={() => setPmStep("files")}
            >
              {t("postmanImport.back")}
            </Button>
            <Button
              variant="contained"
              startIcon={<CloudUpload />}
              onClick={handleFullImport}
              disabled={!workspaceId}
              sx={{ flex: 1 }}
            >
              {t("postmanImport.startImport")}
            </Button>
          </Box>
        </Box>
      );
    }

    if (pmStep === "importing") {
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            py: 4,
          }}
        >
          <CircularProgress size={40} />
          <Typography variant="subtitle1" fontWeight={600}>
            {t("postmanImport.importing")}
          </Typography>
          <LinearProgress sx={{ width: "60%", borderRadius: 1 }} />
        </Box>
      );
    }

    if (pmStep === "result" && importResult) {
      const result = importResult;
      return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Alert severity="success" sx={{ fontWeight: 600 }}>
            {t("postmanImport.importComplete")}
          </Alert>

          <Box sx={{ p: 2, borderRadius: 1.5, border: 1, borderColor: "divider" }}>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
              {t("postmanImport.collectionCreated", {
                name: result.collection.name,
                requests: result.collection.total_requests,
                folders: result.collection.total_folders,
              })}
            </Typography>

            {result.environments.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  {t("postmanImport.environmentsToCreate")}:
                </Typography>
                {result.environments.map((env) => (
                  <Typography key={env.id} variant="body2" color="text.secondary" sx={{ ml: 1, fontSize: "0.8rem" }}>
                    {t("postmanImport.environmentCreated", {
                      name: env.name,
                      type: env.env_type,
                      count: env.variables_count,
                    })}
                  </Typography>
                ))}
              </Box>
            )}

            {result.globals && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: "0.8rem" }}>
                {t("postmanImport.globalsCreated", { count: result.globals.variables_count })}
              </Typography>
            )}

            {result.collection.collection_variables_count > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: "0.8rem" }}>
                {t("postmanImport.collectionVariablesStored", { count: result.collection.collection_variables_count })}
              </Typography>
            )}

            {result.request_scripts_count > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: "0.8rem" }}>
                {t("postmanImport.scriptsImported", { count: result.request_scripts_count })}
              </Typography>
            )}
          </Box>

          {result.errors.length > 0 && (
            <Alert severity="warning">
              {result.errors.map((err, i) => (
                <div key={i}>{err}</div>
              ))}
            </Alert>
          )}

          <Button variant="contained" onClick={handleClose}>
            {t("postmanImport.done")}
          </Button>
        </Box>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>{t("importExport.title")}</DialogTitle>

      <Tabs
        value={mainTab}
        onChange={(_, v) => {
          setMainTab(v);
          setError(null);
          setSuccess(null);
        }}
        sx={{ px: 3, borderBottom: 1, borderColor: "divider" }}
      >
        <Tab
          label={t("importExport.import")}
          icon={<FileDownload sx={{ fontSize: 18 }} />}
          iconPosition="start"
          sx={{ textTransform: "none", fontWeight: 600 }}
        />
        <Tab
          label={t("importExport.export")}
          icon={<Upload sx={{ fontSize: 18 }} />}
          iconPosition="start"
          sx={{ textTransform: "none", fontWeight: 600 }}
        />
      </Tabs>

      <DialogContent sx={{ pt: 2.5 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        {/* IMPORT TAB */}
        {mainTab === 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t("importExport.importSubtitle")}
            </Typography>

            <Tabs
              value={importTab}
              onChange={(_, v) => {
                setImportTab(v);
                setError(null);
                setSuccess(null);
                if (v !== 0) resetPostmanWizard();
              }}
              sx={{ mb: 2, minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 } }}
            >
              <Tab icon={<SwapHoriz sx={{ fontSize: 16 }} />} label={t("importExport.postman")} iconPosition="start" />
              <Tab icon={<Api sx={{ fontSize: 16 }} />} label="OpenAPI" iconPosition="start" />
              <Tab icon={<Terminal sx={{ fontSize: 16 }} />} label="cURL" iconPosition="start" />
            </Tabs>

            {/* Postman Import — Wizard */}
            {importTab === 0 && (
              <Box>
                <Stepper
                  activeStep={stepIndex}
                  alternativeLabel
                  sx={{
                    mb: 2.5,
                    "& .MuiStepLabel-label": { fontSize: "0.75rem", fontWeight: 600 },
                  }}
                >
                  {stepLabels.map((label) => (
                    <Step key={label}>
                      <StepLabel>{label}</StepLabel>
                    </Step>
                  ))}
                </Stepper>

                {renderPostmanWizard()}
              </Box>
            )}

            {/* OpenAPI Import */}
            {importTab === 1 && (
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, py: 3 }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {t("importExport.openapi")}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  {t("importExport.openapiDesc")}
                </Typography>
                <Box sx={{ display: "flex", gap: 0.5 }}>
                  <Chip label="OpenAPI 3.x" size="small" color="success" sx={{ height: 22, fontSize: "0.75rem" }} />
                  <Chip label="Swagger 2.0" size="small" color="success" sx={{ height: 22, fontSize: "0.75rem" }} />
                  <Chip label="JSON / YAML" size="small" color="success" sx={{ height: 22, fontSize: "0.75rem" }} />
                </Box>
                <Button
                  variant="contained"
                  onClick={handleOpenApiImport}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={16} /> : <Upload />}
                >
                  {t("import.selectFile")}
                </Button>
              </Box>
            )}

            {/* cURL Import */}
            {importTab === 2 && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {t("importExport.curlDesc")}
                </Typography>
                <TextField
                  size="small"
                  label={t("import.requestName")}
                  value={curlName}
                  onChange={(e) => setCurlName(e.target.value)}
                  placeholder="My Request"
                  fullWidth
                />
                <TextField
                  multiline
                  minRows={5}
                  maxRows={10}
                  placeholder={`curl -X POST 'https://api.example.com/users' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer token123' \\
  -d '{"name": "John", "email": "john@example.com"}'`}
                  value={curlInput}
                  onChange={(e) => setCurlInput(e.target.value)}
                  sx={{
                    "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: 13 },
                  }}
                />
                <Button
                  variant="contained"
                  onClick={handleCurlImport}
                  disabled={loading || !curlInput.trim()}
                  startIcon={loading ? <CircularProgress size={16} /> : <ContentPaste />}
                >
                  {t("import.importCurl")}
                </Button>
              </Box>
            )}
          </Box>
        )}

        {/* EXPORT TAB */}
        {mainTab === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t("importExport.exportSubtitle")}
            </Typography>

            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>{t("importExport.selectCollection")}</InputLabel>
              <Select
                value={selectedCollectionId}
                onChange={(e) => setSelectedCollectionId(e.target.value)}
                label={t("importExport.selectCollection")}
              >
                {collections.length === 0 ? (
                  <MenuItem disabled>
                    <em>{t("importExport.noCollections")}</em>
                  </MenuItem>
                ) : (
                  collections.map((col) => (
                    <MenuItem key={col.id} value={col.id}>
                      {col.name}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
              <Box sx={{ flex: 1, p: 2, borderRadius: 1.5, border: 1, borderColor: "divider" }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
                  {t("importExport.exportPostman")}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8rem", mb: 1 }}>
                  {t("importExport.exportPostmanDesc")}
                </Typography>
                <Chip label="Postman v2.1" size="small" sx={{ height: 20, fontSize: "0.7rem" }} />
              </Box>

              <Box sx={{ flex: 1, p: 2, borderRadius: 1.5, border: 1, borderColor: "divider" }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
                  {t("importExport.exportJson")}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8rem", mb: 1 }}>
                  {t("importExport.exportJsonDesc")}
                </Typography>
                <Chip label="Full Backup" size="small" sx={{ height: 20, fontSize: "0.7rem" }} />
              </Box>
            </Box>

            <Button
              variant="contained"
              fullWidth
              onClick={handleExport}
              disabled={!selectedCollectionId || loading}
              startIcon={loading ? <CircularProgress size={16} /> : <FileDownload />}
            >
              {t("importExport.exportButton")}
            </Button>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
