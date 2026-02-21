import { useRef, useCallback } from "react";
import {
  Box,
  ToggleButtonGroup,
  ToggleButton,
  Typography,
  Button,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Checkbox,
  IconButton,
  Chip,
} from "@mui/material";
import { Delete, AttachFile, Add } from "@mui/icons-material";
import Editor, { type Monaco } from "@monaco-editor/react";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import KeyValueEditor from "@/components/common/KeyValueEditor";
import { newPair, VariableValueCell } from "@/components/common/KeyValueEditor";
import { registerVariableProviders, getVariableTheme } from "@/utils/monacoVariables";
import type { BodyType, KeyValuePair } from "@/types";
import type { VariableGroup, VariableInfo } from "@/hooks/useVariableGroups";

interface BodyEditorProps {
  bodyType: BodyType;
  body: string;
  formData: KeyValuePair[];
  onBodyTypeChange: (t: BodyType) => void;
  onBodyChange: (b: string) => void;
  onFormDataChange: (pairs: KeyValuePair[]) => void;
  variableGroups?: VariableGroup[];
  resolvedVariables?: Map<string, VariableInfo>;
}

function editorLanguage(bodyType: BodyType): string {
  if (bodyType === "json") return "json";
  if (bodyType === "xml") return "xml";
  return "plaintext";
}

export default function BodyEditor({
  bodyType,
  body,
  formData,
  onBodyTypeChange,
  onBodyChange,
  onFormDataChange,
  variableGroups = [],
  resolvedVariables,
}: BodyEditorProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const isDark = theme.palette.mode === "dark";

  // Keep latest variables in a ref so Monaco providers always see fresh data
  const variablesRef = useRef({ groups: variableGroups, resolved: resolvedVariables ?? new Map<string, VariableInfo>() });
  variablesRef.current = { groups: variableGroups, resolved: resolvedVariables ?? new Map<string, VariableInfo>() };

  const handleBeforeMount = useCallback((monaco: Monaco) => {
    registerVariableProviders(monaco, () => variablesRef.current);
  }, []);

  const handleFormDataFieldChange = useCallback(
    (id: string, field: keyof KeyValuePair, value: string | boolean) => {
      onFormDataChange(
        formData.map((p) => (p.id === id ? { ...p, [field]: value } : p))
      );
    },
    [formData, onFormDataChange],
  );

  const handleFileSelect = useCallback(
    (id: string, file: File | null) => {
      onFormDataChange(
        formData.map((p) =>
          p.id === id
            ? { ...p, file, fileName: file?.name ?? "", type: "file" as const }
            : p
        ),
      );
    },
    [formData, onFormDataChange],
  );

  const handleTypeChange = useCallback(
    (id: string, type: "text" | "file") => {
      onFormDataChange(
        formData.map((p) =>
          p.id === id ? { ...p, type, file: null, fileName: "", value: "" } : p
        ),
      );
    },
    [formData, onFormDataChange],
  );

  const handleAddPair = useCallback(() => {
    onFormDataChange([...formData, newPair()]);
  }, [formData, onFormDataChange]);

  const handleRemovePair = useCallback(
    (id: string) => {
      const next = formData.filter((p) => p.id !== id);
      onFormDataChange(next.length > 0 ? next : [newPair()]);
    },
    [formData, onFormDataChange],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, height: "100%" }}>
      <ToggleButtonGroup
        value={bodyType}
        exclusive
        onChange={(_, v) => v && onBodyTypeChange(v)}
        size="small"
      >
        <ToggleButton value="none">{t("request.none")}</ToggleButton>
        <ToggleButton value="json">JSON</ToggleButton>
        <ToggleButton value="xml">XML</ToggleButton>
        <ToggleButton value="text">Text</ToggleButton>
        <ToggleButton value="form-data">form-data</ToggleButton>
        <ToggleButton value="x-www-form-urlencoded">x-www-form-urlencoded</ToggleButton>
      </ToggleButtonGroup>

      {bodyType === "none" && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          {t("request.noBody")}
        </Typography>
      )}

      {(bodyType === "json" || bodyType === "xml" || bodyType === "text") && (
        <Box sx={{ flex: 1, minHeight: 220 }}>
          <Editor
            height="100%"
            language={editorLanguage(bodyType)}
            theme={getVariableTheme(isDark)}
            value={body}
            onChange={(v) => onBodyChange(v ?? "")}
            beforeMount={handleBeforeMount}
            options={{
              minimap: { enabled: false },
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              fontSize: 13,
              tabSize: 2,
              formatOnPaste: true,
              automaticLayout: true,
            }}
          />
        </Box>
      )}

      {bodyType === "x-www-form-urlencoded" && (
        <KeyValueEditor
          pairs={formData}
          onChange={onFormDataChange}
          keyLabel={t("environment.key")}
          valueLabel={t("common.value")}
          resolvedVariables={resolvedVariables}
          variableGroups={variableGroups}
        />
      )}

      {bodyType === "form-data" && (
        <Box>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem", width: 80 }}>
                  {t("bodyEditor.type", "Type")}
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem" }}>
                  {t("environment.key")}
                </TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: "0.78rem" }}>
                  {t("common.value")}
                </TableCell>
                <TableCell padding="checkbox" />
              </TableRow>
            </TableHead>
            <TableBody>
              {formData.map((pair) => (
                <TableRow key={pair.id} sx={{ "&:hover": { bgcolor: "action.hover" } }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={pair.enabled}
                      onChange={(e) =>
                        handleFormDataFieldChange(pair.id, "enabled", e.target.checked)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      value={pair.type || "text"}
                      onChange={(e) =>
                        handleTypeChange(pair.id, e.target.value as "text" | "file")
                      }
                      sx={{ fontSize: "0.78rem", minWidth: 70 }}
                    >
                      <MenuItem value="text">{t("bodyEditor.textType", "Text")}</MenuItem>
                      <MenuItem value="file">{t("bodyEditor.fileType", "File")}</MenuItem>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <VariableValueCell
                      value={pair.key}
                      onChange={(v) => handleFormDataFieldChange(pair.id, "key", v)}
                      placeholder={t("environment.key")}
                      resolvedVariables={resolvedVariables}
                      variableGroups={variableGroups}
                    />
                  </TableCell>
                  <TableCell>
                    {(pair.type || "text") === "text" ? (
                      <VariableValueCell
                        value={pair.value}
                        onChange={(v) => handleFormDataFieldChange(pair.id, "value", v)}
                        placeholder={t("common.value")}
                        resolvedVariables={resolvedVariables}
                        variableGroups={variableGroups}
                      />
                    ) : (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          component="label"
                          startIcon={<AttachFile sx={{ fontSize: 14 }} />}
                          sx={{ textTransform: "none", fontSize: "0.75rem" }}
                        >
                          {t("bodyEditor.selectFile", "Select File")}
                          <input
                            type="file"
                            hidden
                            onChange={(e) =>
                              handleFileSelect(pair.id, e.target.files?.[0] ?? null)
                            }
                          />
                        </Button>
                        {pair.fileName ? (
                          <Chip
                            label={pair.fileName}
                            size="small"
                            onDelete={() => handleFileSelect(pair.id, null)}
                            sx={{ fontSize: "0.75rem" }}
                          />
                        ) : (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontSize: "0.75rem" }}
                          >
                            {t("bodyEditor.noFileSelected", "No file selected")}
                          </Typography>
                        )}
                      </Box>
                    )}
                  </TableCell>
                  <TableCell padding="checkbox">
                    <IconButton size="small" onClick={() => handleRemovePair(pair.id)}>
                      <Delete sx={{ fontSize: 16 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Button
            size="small"
            startIcon={<Add sx={{ fontSize: 14 }} />}
            onClick={handleAddPair}
            sx={{ mt: 0.5, textTransform: "none", fontSize: "0.78rem" }}
          >
            {t("common.add")}
          </Button>
        </Box>
      )}
    </Box>
  );
}
