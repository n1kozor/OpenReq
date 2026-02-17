import { useCallback } from "react";
import {
  Box, Typography, TextField, Select, MenuItem, FormControl, InputLabel,
  IconButton, Button, Divider, InputAdornment, Autocomplete, Alert,
  Checkbox, FormControlLabel,
} from "@mui/material";
import { Close, Add, Delete, Search } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { Node } from "@xyflow/react";
import type { Collection, CollectionItem } from "@/types";

interface TestFlowNodeInspectorProps {
  node: Node;
  collections: Collection[];
  collectionItems: Record<string, CollectionItem[]>;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

export default function TestFlowNodeInspector({
  node,
  collections,
  collectionItems,
  onUpdateNode,
  onDeleteNode,
  onClose,
}: TestFlowNodeInspectorProps) {
  const { t } = useTranslation();
  const data = node.data as Record<string, unknown>;
  const config = (data.config ?? {}) as Record<string, unknown>;
  const nodeType = data.node_type as string;

  const updateConfig = useCallback(
    (patch: Record<string, unknown>) => {
      onUpdateNode(node.id, {
        ...data,
        config: { ...config, ...patch },
      });
    },
    [node.id, data, config, onUpdateNode],
  );

  const updateLabel = useCallback(
    (label: string) => {
      onUpdateNode(node.id, { ...data, label });
    },
    [node.id, data, onUpdateNode],
  );

  // Get all requests from collections
  const allRequests: { id: string; name: string; method: string; collectionName: string }[] = [];
  for (const col of collections) {
    const items = collectionItems[col.id] || [];
    const flatItems = flattenItems(items);
    for (const item of flatItems) {
      if (!item.is_folder && item.request_id) {
        allRequests.push({
          id: item.request_id,
          name: item.name,
          method: item.method || "GET",
          collectionName: col.name,
        });
      }
    }
  }

  return (
    <Box sx={{ width: 280, borderLeft: "1px solid", borderColor: "divider", bgcolor: "background.paper", display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography variant="body2" fontWeight={600}>
          {t("testFlow.inspector")}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <Close sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto", p: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
        {/* Label */}
        <TextField
          label="Label"
          size="small"
          fullWidth
          value={(data.label as string) || ""}
          onChange={(e) => updateLabel(e.target.value)}
        />

        <Divider />

        {/* Node-type-specific config */}
        {nodeType === "http_request" && (
          <>
            <NodeHelpBox text={t("testFlow.nodeHelp.httpRequest")} />
            <HttpRequestConfig
              config={config}
              updateConfig={updateConfig}
              allRequests={allRequests}
              t={t}
            />
          </>
        )}

        {nodeType === "collection" && (
          <>
            <NodeHelpBox text={t("testFlow.nodeHelp.collection")} />
            <CollectionConfig
              config={config}
              updateConfig={updateConfig}
              collections={collections}
              t={t}
            />
          </>
        )}

        {nodeType === "assertion" && (
          <>
            <NodeHelpBox text={t("testFlow.nodeHelp.assertion")} />
            <AssertionConfig config={config} updateConfig={updateConfig} t={t} />
          </>
        )}

        {nodeType === "script" && (
          <>
            <NodeHelpBox text={t("testFlow.nodeHelp.script")} />
            <ScriptConfig config={config} updateConfig={updateConfig} t={t} />
          </>
        )}

        {nodeType === "delay" && (
          <>
            <NodeHelpBox text={t("testFlow.nodeHelp.delay")} />
            <TextField
              label={t("testFlow.nodeConfig.delayMs")}
              type="number"
              size="small"
              fullWidth
              value={(config.delay_ms as number) ?? 1000}
              onChange={(e) => updateConfig({ delay_ms: Number(e.target.value) })}
            />
          </>
        )}

        {nodeType === "condition" && (
          <>
            <NodeHelpBox text={t("testFlow.nodeHelp.condition")} />
            <ConditionConfig config={config} updateConfig={updateConfig} t={t} />
          </>
        )}

        {nodeType === "loop" && (
          <>
            <NodeHelpBox text={t("testFlow.nodeHelp.loop")} />
            <LoopConfig config={config} updateConfig={updateConfig} t={t} />
          </>
        )}

        {nodeType === "set_variable" && (
          <>
            <NodeHelpBox text={t("testFlow.nodeHelp.setVariable")} />
            <SetVariableConfig config={config} updateConfig={updateConfig} t={t} />
          </>
        )}

        {nodeType === "group" && (
          <TextField
            label={t("testFlow.nodeConfig.groupColor")}
            size="small"
            fullWidth
            type="color"
            value={(config.color as string) || "#3b82f6"}
            onChange={(e) => updateConfig({ color: e.target.value })}
          />
        )}

        {nodeType === "websocket" && (
          <>
            <NodeHelpBox text={t("testFlow.nodeHelp.websocket")} />
            <TextField
              label={t("testFlow.nodeConfig.wsUrl")}
              size="small"
              fullWidth
              value={(config.ws_url as string) || ""}
              onChange={(e) => updateConfig({ ws_url: e.target.value })}
              placeholder="wss://echo.websocket.org"
              sx={{ "& input": { fontFamily: "monospace", fontSize: "0.8rem" } }}
            />
            <TextField
              label={t("testFlow.nodeConfig.wsMessage")}
              size="small"
              fullWidth
              multiline
              minRows={2}
              maxRows={6}
              value={(config.ws_message as string) || ""}
              onChange={(e) => updateConfig({ ws_message: e.target.value })}
              placeholder='{"action": "subscribe"}'
              sx={{ "& textarea": { fontFamily: "monospace", fontSize: "0.8rem" } }}
            />
            <TextField
              label={t("testFlow.nodeConfig.wsTimeout")}
              type="number"
              size="small"
              fullWidth
              value={(config.ws_timeout_ms as number) ?? 5000}
              onChange={(e) => updateConfig({ ws_timeout_ms: Number(e.target.value) })}
              slotProps={{ htmlInput: { min: 100, max: 60000 } }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={(config.ws_wait_response as boolean) ?? true}
                  onChange={(e) => updateConfig({ ws_wait_response: e.target.checked })}
                />
              }
              label={t("testFlow.nodeConfig.wsWaitResponse")}
              sx={{ "& .MuiFormControlLabel-label": { fontSize: "0.8rem" } }}
            />
          </>
        )}

        {nodeType === "graphql" && (
          <>
            <NodeHelpBox text={t("testFlow.nodeHelp.graphql")} />
            <TextField
              label={t("testFlow.nodeConfig.gqlUrl")}
              size="small"
              fullWidth
              value={(config.graphql_url as string) || ""}
              onChange={(e) => updateConfig({ graphql_url: e.target.value })}
              placeholder="https://api.example.com/graphql"
              sx={{ "& input": { fontFamily: "monospace", fontSize: "0.8rem" } }}
            />
            <TextField
              label={t("testFlow.nodeConfig.gqlQuery")}
              size="small"
              fullWidth
              multiline
              minRows={4}
              maxRows={10}
              value={(config.graphql_query as string) || ""}
              onChange={(e) => updateConfig({ graphql_query: e.target.value })}
              placeholder={"query {\n  users {\n    id\n    name\n  }\n}"}
              sx={{ "& textarea": { fontFamily: "monospace", fontSize: "0.75rem" } }}
            />
            <TextField
              label={t("testFlow.nodeConfig.gqlVariables")}
              size="small"
              fullWidth
              multiline
              minRows={2}
              maxRows={6}
              value={(config.graphql_variables as string) || "{}"}
              onChange={(e) => updateConfig({ graphql_variables: e.target.value })}
              placeholder='{}'
              sx={{ "& textarea": { fontFamily: "monospace", fontSize: "0.75rem" } }}
            />
          </>
        )}

        <Divider />

        {/* Delete node */}
        <Button
          variant="outlined"
          color="error"
          size="small"
          startIcon={<Delete />}
          onClick={() => onDeleteNode(node.id)}
          fullWidth
        >
          {t("testFlow.deleteNode")}
        </Button>
      </Box>
    </Box>
  );
}

function flattenItems(items: CollectionItem[]): CollectionItem[] {
  const result: CollectionItem[] = [];
  for (const item of items) {
    result.push(item);
    if (item.children) {
      result.push(...flattenItems(item.children));
    }
  }
  return result;
}

// ── Help box ──

function NodeHelpBox({ text }: { text: string }) {
  return (
    <Alert severity="info" icon={false} sx={{ py: 0.25, px: 1, "& .MuiAlert-message": { fontSize: "0.7rem", lineHeight: 1.4 } }}>
      {text}
    </Alert>
  );
}

// ── Sub-config components ──

function HttpRequestConfig({
  config,
  updateConfig,
  allRequests,
  t,
}: {
  config: Record<string, unknown>;
  updateConfig: (patch: Record<string, unknown>) => void;
  allRequests: { id: string; name: string; method: string; collectionName: string }[];
  t: (key: string) => string;
}) {
  const selectedRequest = allRequests.find((r) => r.id === (config.request_id as string)) || null;

  return (
    <Autocomplete
      size="small"
      fullWidth
      options={allRequests}
      value={selectedRequest}
      onChange={(_, req) => {
        updateConfig({
          request_id: req?.id || undefined,
          request_name_hint: req?.name,
        });
      }}
      getOptionLabel={(opt) => `${opt.method} ${opt.name}`}
      filterOptions={(options, { inputValue }) => {
        const q = inputValue.toLowerCase();
        return options.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            o.method.toLowerCase().includes(q) ||
            o.collectionName.toLowerCase().includes(q),
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={t("testFlow.nodeConfig.selectRequest")}
          placeholder={t("testFlow.nodeConfig.searchRequests")}
          slotProps={{
            input: {
              ...params.InputProps,
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ fontSize: 16, color: "text.secondary" }} />
                </InputAdornment>
              ),
            },
          }}
        />
      )}
      renderOption={(props, opt) => (
        <li {...props} key={opt.id}>
          <Box sx={{ display: "flex", alignItems: "center", width: "100%", gap: 0.75 }}>
            <Box
              component="span"
              sx={{ fontWeight: 700, color: methodColor(opt.method), fontSize: "0.65rem", minWidth: 32 }}
            >
              {opt.method}
            </Box>
            <Typography variant="body2" noWrap sx={{ flex: 1, fontSize: "0.8rem" }}>
              {opt.name}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.65rem", flexShrink: 0 }}>
              {opt.collectionName}
            </Typography>
          </Box>
        </li>
      )}
      isOptionEqualToValue={(opt, val) => opt.id === val.id}
      noOptionsText={t("testFlow.nodeConfig.noRequest")}
    />
  );
}

function CollectionConfig({
  config,
  updateConfig,
  collections,
  t,
}: {
  config: Record<string, unknown>;
  updateConfig: (patch: Record<string, unknown>) => void;
  collections: Collection[];
  t: (key: string) => string;
}) {
  return (
    <FormControl size="small" fullWidth>
      <InputLabel>{t("testFlow.nodeConfig.selectCollection")}</InputLabel>
      <Select
        value={(config.collection_id as string) || ""}
        onChange={(e) => {
          const col = collections.find((c) => c.id === e.target.value);
          updateConfig({
            collection_id: e.target.value || undefined,
            collection_name_hint: col?.name,
          });
        }}
        label={t("testFlow.nodeConfig.selectCollection")}
      >
        <MenuItem value="">
          <em>{t("testFlow.nodeConfig.noCollection")}</em>
        </MenuItem>
        {collections.map((col) => (
          <MenuItem key={col.id} value={col.id} sx={{ fontSize: "0.8rem" }}>
            {col.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function ConditionConfig({
  config,
  updateConfig,
  t,
}: {
  config: Record<string, unknown>;
  updateConfig: (patch: Record<string, unknown>) => void;
  t: (key: string) => string;
}) {
  return (
    <>
      <TextField
        label={t("testFlow.nodeConfig.expression")}
        size="small"
        fullWidth
        multiline
        minRows={2}
        value={(config.expression as string) || ""}
        onChange={(e) => updateConfig({ expression: e.target.value })}
        placeholder="status_code == 200"
        sx={{ "& textarea": { fontFamily: "monospace", fontSize: "0.8rem" } }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
        {t("testFlow.nodeConfig.conditionPresets")}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
        {CONDITION_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            size="small"
            variant="outlined"
            sx={{ fontSize: "0.65rem", py: 0.25, px: 0.75, minWidth: 0, textTransform: "none" }}
            onClick={() => updateConfig({ expression: preset.expression })}
          >
            {preset.label}
          </Button>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, fontSize: "0.65rem" }}>
        {t("testFlow.nodeConfig.conditionHelpVars")}
      </Typography>
    </>
  );
}

const CONDITION_PRESETS = [
  { label: "200 OK", expression: "status_code == 200" },
  { label: "No error (< 400)", expression: "status_code < 400" },
  { label: "Is error (>= 400)", expression: "status_code >= 400" },
  { label: "Body not empty", expression: 'response_body != ""' },
  { label: "No error in body", expression: '"error" not in response_body' },
  { label: "Under 1s", expression: "elapsed_ms < 1000" },
  { label: "Token exists", expression: 'vars.get("token") is not None' },
  { label: "Iteration < 5", expression: "iteration < 5" },
];

function AssertionConfig({
  config,
  updateConfig,
  t,
}: {
  config: Record<string, unknown>;
  updateConfig: (patch: Record<string, unknown>) => void;
  t: (key: string) => string;
}) {
  const assertions = ((config.assertions as unknown[]) || []) as {
    type: string;
    field?: string;
    operator: string;
    expected: string;
  }[];

  const addAssertion = () => {
    updateConfig({
      assertions: [
        ...assertions,
        { type: "status_code", operator: "eq", expected: "200", field: "" },
      ],
    });
  };

  const removeAssertion = (index: number) => {
    const next = [...assertions];
    next.splice(index, 1);
    updateConfig({ assertions: next });
  };

  const updateAssertion = (index: number, patch: Record<string, string>) => {
    const next = [...assertions];
    const existing = next[index];
    if (!existing) return;
    next[index] = { ...existing, ...patch };
    updateConfig({ assertions: next });
  };

  return (
    <>
      {assertions.map((a, i) => (
        <Box key={i} sx={{ display: "flex", flexDirection: "column", gap: 0.5, p: 1, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <Select
                value={a.type}
                onChange={(e) => updateAssertion(i, { type: e.target.value })}
                sx={{ fontSize: "0.75rem" }}
              >
                {["status_code", "body_contains", "json_path", "header_check", "response_time"].map((type) => (
                  <MenuItem key={type} value={type} sx={{ fontSize: "0.75rem" }}>
                    {t(`testFlow.nodeConfig.${toCamelCase(type)}`)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <IconButton size="small" onClick={() => removeAssertion(i)}>
              <Delete sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
          {(a.type === "json_path" || a.type === "header_check") && (
            <TextField
              label={t("testFlow.nodeConfig.field")}
              size="small"
              fullWidth
              value={a.field || ""}
              onChange={(e) => updateAssertion(i, { field: e.target.value })}
              sx={{ "& input": { fontSize: "0.8rem" } }}
            />
          )}
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <FormControl size="small" sx={{ width: 80 }}>
              <Select
                value={a.operator}
                onChange={(e) => updateAssertion(i, { operator: e.target.value })}
                sx={{ fontSize: "0.7rem" }}
              >
                {["eq", "neq", "gt", "lt", "gte", "lte", "contains", "not_contains", "regex"].map((op) => (
                  <MenuItem key={op} value={op} sx={{ fontSize: "0.75rem" }}>
                    {op}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={t("testFlow.nodeConfig.expectedValue")}
              size="small"
              fullWidth
              value={a.expected}
              onChange={(e) => updateAssertion(i, { expected: e.target.value })}
              sx={{ "& input": { fontSize: "0.8rem" } }}
            />
          </Box>
        </Box>
      ))}
      <Button size="small" startIcon={<Add />} onClick={addAssertion}>
        {t("testFlow.nodeConfig.addAssertion")}
      </Button>

      {/* Quick presets */}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
        {t("testFlow.nodeConfig.quickPresets")}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
        {ASSERTION_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            size="small"
            variant="outlined"
            sx={{ fontSize: "0.65rem", py: 0.25, px: 0.75, minWidth: 0, textTransform: "none" }}
            onClick={() => updateConfig({ assertions: [...assertions, ...preset.assertions] })}
          >
            {preset.label}
          </Button>
        ))}
      </Box>
    </>
  );
}

const ASSERTION_PRESETS = [
  {
    label: "200 OK",
    assertions: [{ type: "status_code", operator: "eq", expected: "200", field: "" }],
  },
  {
    label: "201 Created",
    assertions: [{ type: "status_code", operator: "eq", expected: "201", field: "" }],
  },
  {
    label: "204 No Content",
    assertions: [{ type: "status_code", operator: "eq", expected: "204", field: "" }],
  },
  {
    label: "2xx Success",
    assertions: [
      { type: "status_code", operator: "gte", expected: "200", field: "" },
      { type: "status_code", operator: "lt", expected: "300", field: "" },
    ],
  },
  {
    label: "Not 4xx/5xx",
    assertions: [{ type: "status_code", operator: "lt", expected: "400", field: "" }],
  },
  {
    label: "301 Redirect",
    assertions: [{ type: "status_code", operator: "eq", expected: "301", field: "" }],
  },
  {
    label: "401 Unauthorized",
    assertions: [{ type: "status_code", operator: "eq", expected: "401", field: "" }],
  },
  {
    label: "404 Not Found",
    assertions: [{ type: "status_code", operator: "eq", expected: "404", field: "" }],
  },
  {
    label: "Has JSON body",
    assertions: [{ type: "body_contains", operator: "contains", expected: "{", field: "" }],
  },
  {
    label: "Body not empty",
    assertions: [{ type: "body_contains", operator: "neq", expected: "", field: "" }],
  },
  {
    label: "Fast (< 500ms)",
    assertions: [{ type: "response_time", operator: "lt", expected: "500", field: "" }],
  },
  {
    label: "Very fast (< 100ms)",
    assertions: [{ type: "response_time", operator: "lt", expected: "100", field: "" }],
  },
  {
    label: "JSON $.id exists",
    assertions: [{ type: "json_path", operator: "neq", expected: "", field: "$.id" }],
  },
  {
    label: "Content-Type JSON",
    assertions: [{ type: "header_check", operator: "contains", expected: "application/json", field: "content-type" }],
  },
  {
    label: "Has Auth header",
    assertions: [{ type: "header_check", operator: "neq", expected: "", field: "Authorization" }],
  },
];

function ScriptConfig({
  config,
  updateConfig,
  t,
}: {
  config: Record<string, unknown>;
  updateConfig: (patch: Record<string, unknown>) => void;
  t: (key: string) => string;
}) {
  const language = (config.language as string) || "javascript";
  const templates = language === "javascript" ? JS_SCRIPT_TEMPLATES : PY_SCRIPT_TEMPLATES;

  return (
    <>
      <FormControl size="small" fullWidth>
        <InputLabel>{t("testFlow.nodeConfig.language")}</InputLabel>
        <Select
          value={language}
          onChange={(e) => updateConfig({ language: e.target.value })}
          label={t("testFlow.nodeConfig.language")}
        >
          <MenuItem value="javascript">JavaScript</MenuItem>
          <MenuItem value="python">Python</MenuItem>
        </Select>
      </FormControl>
      <TextField
        label={t("testFlow.nodeConfig.script")}
        size="small"
        fullWidth
        multiline
        minRows={4}
        maxRows={12}
        value={(config.script as string) || ""}
        onChange={(e) => updateConfig({ script: e.target.value })}
        sx={{ "& textarea": { fontFamily: "monospace", fontSize: "0.75rem" } }}
      />

      {/* Script templates */}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
        {t("testFlow.nodeConfig.scriptTemplates")}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {templates.map((tmpl) => (
          <Button
            key={tmpl.label}
            size="small"
            variant="outlined"
            sx={{ fontSize: "0.65rem", py: 0.25, textTransform: "none", justifyContent: "flex-start" }}
            onClick={() => {
              const current = (config.script as string) || "";
              updateConfig({ script: current ? current + "\n\n" + tmpl.code : tmpl.code });
            }}
          >
            {tmpl.label}
          </Button>
        ))}
      </Box>
    </>
  );
}

const JS_SCRIPT_TEMPLATES = [
  {
    label: "Log response status",
    code: `// Log response status code\nconst status = req.response.status;\nconsole.log("Status:", status);`,
  },
  {
    label: "Parse JSON body",
    code: `// Parse response JSON\nconst body = req.response.json;\nconsole.log("Response:", JSON.stringify(body));`,
  },
  {
    label: "Set variable from response",
    code: `// Extract value from response and set variable\nconst body = req.response.json;\nreq.variables.set("token", body.access_token);`,
  },
  {
    label: "Assert status 200",
    code: `// Check status code\nreq.test("Status is 200", req.response.status === 200);`,
  },
  {
    label: "Assert JSON field",
    code: `// Check JSON field value\nreq.expect(req.response.json.id).to_exist();\nreq.expect(req.response.json.id).to_be_a("string");`,
  },
  {
    label: "Assert response time",
    code: `// Check response time < 500ms\nreq.expect(req.response.time).to_be_below(500);`,
  },
  {
    label: "Assert array length",
    code: `// Check array has items\nreq.expect(req.response.json.items).to_be_a("array");\nreq.expect(req.response.json.items.length).to_be_above(0);`,
  },
  {
    label: "Assert headers",
    code: `// Check content type header\nreq.expect(req.response.headers["content-type"]).to_include("application/json");`,
  },
  {
    label: "Chain requests (auth)",
    code: `// Send a login request, store token for next steps\nconst resp = req.sendRequest({\n  url: "https://api.example.com/auth/login",\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  json: { email: "test@example.com", password: "secret" }\n});\nreq.variables.set("token", resp.json.access_token);\nconsole.log("Token saved:", resp.json.access_token);`,
  },
  {
    label: "Validate schema",
    code: `// Check all required fields exist\nconst body = req.response.json;\nreq.expect(body).to_have_property("id");\nreq.expect(body).to_have_property("name");\nreq.expect(body).to_have_property("email");\nreq.expect(body.email).to_match("@");`,
  },
];

const PY_SCRIPT_TEMPLATES = [
  {
    label: "Log response status",
    code: `# Log response status\nreq.log("Status:", req.response.status)`,
  },
  {
    label: "Parse JSON body",
    code: `# Parse response JSON\nimport json\nbody = req.response.json\nreq.log(json.dumps(body, indent=2))`,
  },
  {
    label: "Set variable from response",
    code: `# Extract value and set variable\nreq.variables.set("token", req.response.json.access_token)`,
  },
  {
    label: "Assert status 200",
    code: `# Check status code\nreq.test("Status is 200", req.response.status == 200)`,
  },
  {
    label: "Assert JSON field",
    code: `# Check JSON field exists and is string\nreq.expect(req.response.json.id).to_exist()\nreq.expect(req.response.json.id).to_be_a("string")`,
  },
  {
    label: "Assert response time",
    code: `# Check response time under 500ms\nreq.expect(req.response.time).to_be_below(500)`,
  },
  {
    label: "Assert array length",
    code: `# Check array has items\nreq.expect(req.response.json.items).to_be_a("array")\nreq.expect(len(req.response.json.items)).to_be_above(0)`,
  },
  {
    label: "Assert headers",
    code: `# Check content type header\nreq.expect(req.response.headers["content-type"]).to_include("application/json")`,
  },
  {
    label: "Chain requests (auth)",
    code: `# Send a login request, store token\nresp = req.sendRequest(\n    url="https://api.example.com/auth/login",\n    method="POST",\n    headers={"Content-Type": "application/json"},\n    json={"email": "test@example.com", "password": "secret"}\n)\nreq.variables.set("token", resp.json.access_token)\nreq.log("Token saved:", resp.json.access_token)`,
  },
  {
    label: "Validate schema",
    code: `# Check all required fields exist\nreq.expect(req.response.json).to_have_property("id")\nreq.expect(req.response.json).to_have_property("name")\nreq.expect(req.response.json).to_have_property("email")\nreq.expect(req.response.json.email).to_match(r"@")`,
  },
];

function LoopConfig({
  config,
  updateConfig,
  t,
}: {
  config: Record<string, unknown>;
  updateConfig: (patch: Record<string, unknown>) => void;
  t: (key: string) => string;
}) {
  const mode = (config.mode as string) || "count";
  return (
    <>
      <FormControl size="small" fullWidth>
        <InputLabel>{t("testFlow.nodeConfig.loopMode")}</InputLabel>
        <Select
          value={mode}
          onChange={(e) => updateConfig({ mode: e.target.value })}
          label={t("testFlow.nodeConfig.loopMode")}
        >
          <MenuItem value="count">{t("testFlow.nodeConfig.loopCount")}</MenuItem>
          <MenuItem value="condition">{t("testFlow.nodeConfig.loopCondition")}</MenuItem>
        </Select>
      </FormControl>
      {mode === "count" ? (
        <TextField
          label={t("testFlow.nodeConfig.loopCount")}
          type="number"
          size="small"
          fullWidth
          value={(config.count as number) ?? 3}
          onChange={(e) => updateConfig({ count: Number(e.target.value) })}
          slotProps={{ htmlInput: { min: 1, max: 1000 } }}
        />
      ) : (
        <TextField
          label={t("testFlow.nodeConfig.loopCondition")}
          size="small"
          fullWidth
          value={(config.condition as string) || ""}
          onChange={(e) => updateConfig({ condition: e.target.value })}
          placeholder="iteration < 10"
          sx={{ "& input": { fontFamily: "monospace", fontSize: "0.8rem" } }}
        />
      )}
      <TextField
        label={t("testFlow.nodeConfig.maxIterations")}
        type="number"
        size="small"
        fullWidth
        value={(config.max_iterations as number) ?? 100}
        onChange={(e) => updateConfig({ max_iterations: Number(e.target.value) })}
        slotProps={{ htmlInput: { min: 1, max: 10000 } }}
      />
    </>
  );
}

function SetVariableConfig({
  config,
  updateConfig,
  t,
}: {
  config: Record<string, unknown>;
  updateConfig: (patch: Record<string, unknown>) => void;
  t: (key: string) => string;
}) {
  const assignments = ((config.assignments as unknown[]) || []) as { key: string; value: string }[];

  const add = () => {
    updateConfig({ assignments: [...assignments, { key: "", value: "" }] });
  };

  const remove = (index: number) => {
    const next = [...assignments];
    next.splice(index, 1);
    updateConfig({ assignments: next });
  };

  const update = (index: number, field: "key" | "value", val: string) => {
    const next = [...assignments];
    const existing = next[index];
    if (!existing) return;
    next[index] = { ...existing, [field]: val };
    updateConfig({ assignments: next });
  };

  return (
    <>
      {assignments.map((a, i) => (
        <Box key={i} sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
          <TextField
            label={t("testFlow.nodeConfig.variableKey")}
            size="small"
            value={a.key}
            onChange={(e) => update(i, "key", e.target.value)}
            sx={{ flex: 1, "& input": { fontSize: "0.8rem" } }}
          />
          <TextField
            label={t("testFlow.nodeConfig.variableValue")}
            size="small"
            value={a.value}
            onChange={(e) => update(i, "value", e.target.value)}
            sx={{ flex: 1, "& input": { fontSize: "0.8rem" } }}
          />
          <IconButton size="small" onClick={() => remove(i)}>
            <Delete sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      ))}
      <Button size="small" startIcon={<Add />} onClick={add}>
        {t("common.add")}
      </Button>
    </>
  );
}

function methodColor(m: string) {
  const map: Record<string, string> = {
    GET: "#34d399", POST: "#fbbf24", PUT: "#818cf8", PATCH: "#f472b6",
    DELETE: "#f87171", HEAD: "#38bdf8", OPTIONS: "#a78bfa",
  };
  return map[m] || "#8b949e";
}

function toCamelCase(s: string) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
