import { useState, useMemo } from "react";
import {
  Box,
  Typography,
  TextField,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Chip,
  InputAdornment,
  Divider,
} from "@mui/material";
import {
  ArrowBack,
  Search,
  AddCircleOutline,
} from "@mui/icons-material";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import type { GQLSchema, GQLType, GQLTypeField, GQLTypeRef, GQLInputValue } from "@/types";

interface GQLSchemaExplorerProps {
  schema: GQLSchema;
  onInsertQuery: (query: string, variables: string) => void;
}

const KIND_COLORS: Record<string, string> = {
  OBJECT: "#22c55e",
  INPUT_OBJECT: "#f59e0b",
  ENUM: "#a855f7",
  SCALAR: "#64748b",
  INTERFACE: "#3b82f6",
  UNION: "#ec4899",
};

function typeRefToString(ref: GQLTypeRef): string {
  if (!ref) return "unknown";
  if (ref.kind === "NON_NULL") return `${typeRefToString(ref.ofType!)}!`;
  if (ref.kind === "LIST") return `[${typeRefToString(ref.ofType!)}]`;
  return ref.name || "unknown";
}

function unwrapType(ref: GQLTypeRef): string | null {
  if (!ref) return null;
  if (ref.name) return ref.name;
  if (ref.ofType) return unwrapType(ref.ofType);
  return null;
}

function generateQueryString(
  schema: GQLSchema,
  operationType: "query" | "mutation" | "subscription",
  field: GQLTypeField,
  maxDepth: number = 2,
): { query: string; variables: string } {
  const vars: { name: string; type: string }[] = [];
  const argStr = field.args.length > 0
    ? `(${field.args.map((a) => {
        vars.push({ name: a.name, type: a.type });
        return `${a.name}: $${a.name}`;
      }).join(", ")})`
    : "";

  const varDef = vars.length > 0
    ? `(${vars.map((v) => `$${v.name}: ${v.type}`).join(", ")})`
    : "";

  function buildSelection(typeName: string | null, depth: number, visited: Set<string>): string {
    if (!typeName || depth <= 0) return "";
    if (visited.has(typeName)) return "";
    const t = schema.types[typeName];
    if (!t || t.fields.length === 0) return "";

    visited.add(typeName);
    const lines: string[] = [];
    for (const f of t.fields) {
      const innerType = unwrapType(f.typeRef);
      const innerT = innerType ? schema.types[innerType] : null;
      if (innerT && innerT.fields.length > 0 && depth > 1) {
        const sub = buildSelection(innerType, depth - 1, new Set(visited));
        if (sub) {
          lines.push(`${f.name} {\n${sub}\n}`);
        } else {
          lines.push(f.name);
        }
      } else {
        lines.push(f.name);
      }
    }
    return lines.map((l) => l.split("\n").map((x) => `  ${x}`).join("\n")).join("\n");
  }

  const returnType = unwrapType(field.typeRef);
  const selection = buildSelection(returnType, maxDepth, new Set());
  const body = selection ? ` {\n${selection}\n  }` : "";
  const query = `${operationType}${varDef} {\n  ${field.name}${argStr}${body}\n}`;

  const variablesObj: Record<string, unknown> = {};
  for (const v of vars) {
    const base = v.type.replace(/[!\[\]]/g, "");
    if (base === "Int" || base === "Float") variablesObj[v.name] = 0;
    else if (base === "Boolean") variablesObj[v.name] = false;
    else variablesObj[v.name] = "";
  }

  return { query, variables: JSON.stringify(variablesObj, null, 2) };
}

export default function GQLSchemaExplorer({ schema, onInsertQuery }: GQLSchemaExplorerProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const [explorerTab, setExplorerTab] = useState(0);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [history, setHistory] = useState<string[]>([]);

  const queryFields = schema.queryType ? (schema.types[schema.queryType]?.fields ?? []) : [];
  const mutationFields = schema.mutationType ? (schema.types[schema.mutationType]?.fields ?? []) : [];
  const subscriptionFields = schema.subscriptionType ? (schema.types[schema.subscriptionType]?.fields ?? []) : [];

  const allTypes = useMemo(() => {
    return Object.values(schema.types)
      .filter((t) => !t.name.startsWith("__"))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [schema]);

  const filteredTypes = useMemo(() => {
    if (!searchText) return allTypes;
    const lower = searchText.toLowerCase();
    return allTypes.filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.fields.some((f) => f.name.toLowerCase().includes(lower)),
    );
  }, [allTypes, searchText]);

  const filterFields = (fields: GQLTypeField[]) => {
    if (!searchText) return fields;
    const lower = searchText.toLowerCase();
    return fields.filter((f) => f.name.toLowerCase().includes(lower));
  };

  const navigateToType = (typeName: string) => {
    if (schema.types[typeName]) {
      if (selectedType) setHistory((h) => [...h, selectedType]);
      setSelectedType(typeName);
    }
  };

  const goBack = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1] ?? null;
      setHistory((h) => h.slice(0, -1));
      setSelectedType(prev);
    } else {
      setSelectedType(null);
    }
  };

  const renderFieldRow = (field: GQLTypeField, opType?: "query" | "mutation" | "subscription") => {
    const returnTypeName = unwrapType(field.typeRef);
    const isNavigable = returnTypeName && schema.types[returnTypeName] && !["String", "Int", "Float", "Boolean", "ID"].includes(returnTypeName);

    return (
      <Box
        key={field.name}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          py: 0.5,
          px: 1,
          borderRadius: 1,
          "&:hover": { bgcolor: alpha(theme.palette.text.primary, 0.04) },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, fontFamily: "monospace" }}>
              {field.name}
            </Typography>
            {field.args.length > 0 && (
              <Typography sx={{ fontSize: "0.65rem", color: "text.secondary" }}>
                ({field.args.map((a) => a.name).join(", ")})
              </Typography>
            )}
          </Box>
          <Typography
            sx={{
              fontSize: "0.7rem",
              color: isNavigable ? theme.palette.primary.main : "text.secondary",
              cursor: isNavigable ? "pointer" : "default",
              fontFamily: "monospace",
              "&:hover": isNavigable ? { textDecoration: "underline" } : {},
            }}
            onClick={() => isNavigable && navigateToType(returnTypeName!)}
          >
            {field.type}
          </Typography>
          {field.isDeprecated && (
            <Chip label={t("graphql.deprecated")} size="small" color="warning" sx={{ height: 16, fontSize: "0.6rem", mt: 0.25 }} />
          )}
          {field.description && (
            <Typography sx={{ fontSize: "0.68rem", color: "text.secondary", mt: 0.25 }}>
              {field.description}
            </Typography>
          )}
        </Box>
        {opType && (
          <Tooltip title={t("graphql.insertQueryTooltip")}>
            <IconButton
              size="small"
              onClick={() => {
                const { query, variables } = generateQueryString(schema, opType, field);
                onInsertQuery(query, variables);
              }}
              sx={{ p: 0.25, color: theme.palette.primary.main }}
            >
              <AddCircleOutline sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    );
  };

  const renderArgsList = (args: GQLInputValue[]) => (
    <Box sx={{ pl: 2, py: 0.25 }}>
      {args.map((a) => (
        <Box key={a.name} sx={{ display: "flex", gap: 0.5, py: 0.15 }}>
          <Typography sx={{ fontSize: "0.7rem", fontFamily: "monospace", fontWeight: 600 }}>{a.name}:</Typography>
          <Typography sx={{ fontSize: "0.7rem", fontFamily: "monospace", color: "text.secondary" }}>{a.type}</Typography>
          {a.defaultValue && (
            <Typography sx={{ fontSize: "0.65rem", color: "text.disabled" }}>= {a.defaultValue}</Typography>
          )}
        </Box>
      ))}
    </Box>
  );

  const renderTypeDetail = (typeDef: GQLType) => (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.5 }}>
        <IconButton size="small" onClick={goBack} sx={{ p: 0.25 }}>
          <ArrowBack sx={{ fontSize: 16 }} />
        </IconButton>
        <Typography sx={{ fontSize: "0.85rem", fontWeight: 700, fontFamily: "monospace" }}>
          {typeDef.name}
        </Typography>
        <Chip
          label={typeDef.kind.replace("_", " ")}
          size="small"
          sx={{
            height: 18,
            fontSize: "0.6rem",
            fontWeight: 700,
            bgcolor: alpha(KIND_COLORS[typeDef.kind] ?? "#888", 0.15),
            color: KIND_COLORS[typeDef.kind] ?? "#888",
          }}
        />
      </Box>
      {typeDef.description && (
        <Typography sx={{ fontSize: "0.72rem", color: "text.secondary", px: 1, pb: 0.5 }}>
          {typeDef.description}
        </Typography>
      )}
      <Divider />

      {typeDef.kind === "ENUM" && typeDef.enumValues.length > 0 && (
        <Box sx={{ p: 1 }}>
          <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, mb: 0.5 }}>Values</Typography>
          {typeDef.enumValues.map((ev) => (
            <Box key={ev.name} sx={{ py: 0.15 }}>
              <Typography sx={{ fontSize: "0.75rem", fontFamily: "monospace", fontWeight: 600 }}>{ev.name}</Typography>
              {ev.description && (
                <Typography sx={{ fontSize: "0.65rem", color: "text.secondary" }}>{ev.description}</Typography>
              )}
            </Box>
          ))}
        </Box>
      )}

      {typeDef.fields.length > 0 && (
        <Box sx={{ pt: 0.5 }}>
          <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, px: 1, mb: 0.25 }}>{t("graphql.fields")}</Typography>
          {typeDef.fields.map((f) => (
            <Box key={f.name}>
              {renderFieldRow(f)}
              {f.args.length > 0 && renderArgsList(f.args)}
            </Box>
          ))}
        </Box>
      )}

      {typeDef.inputFields.length > 0 && (
        <Box sx={{ pt: 0.5 }}>
          <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, px: 1, mb: 0.25 }}>{t("graphql.fields")}</Typography>
          {typeDef.inputFields.map((f) => (
            <Box key={f.name} sx={{ px: 1, py: 0.25 }}>
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Typography sx={{ fontSize: "0.75rem", fontFamily: "monospace", fontWeight: 600 }}>{f.name}</Typography>
                <Typography sx={{ fontSize: "0.7rem", fontFamily: "monospace", color: "text.secondary" }}>{f.type}</Typography>
              </Box>
              {f.description && (
                <Typography sx={{ fontSize: "0.65rem", color: "text.secondary" }}>{f.description}</Typography>
              )}
            </Box>
          ))}
        </Box>
      )}

      {typeDef.possibleTypes.length > 0 && (
        <Box sx={{ p: 1 }}>
          <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, mb: 0.25 }}>Possible Types</Typography>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {typeDef.possibleTypes.map((pt) => (
              <Chip
                key={pt}
                label={pt}
                size="small"
                onClick={() => navigateToType(pt)}
                sx={{ height: 20, fontSize: "0.68rem", cursor: "pointer" }}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );

  const renderTypeList = (types: GQLType[]) => (
    <Box>
      {types.map((t) => (
        <Box
          key={t.name}
          onClick={() => navigateToType(t.name)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            px: 1,
            py: 0.4,
            cursor: "pointer",
            borderRadius: 1,
            "&:hover": { bgcolor: alpha(theme.palette.text.primary, 0.04) },
          }}
        >
          <Chip
            label={t.kind.replace("_", " ").slice(0, 3)}
            size="small"
            sx={{
              height: 16,
              fontSize: "0.55rem",
              fontWeight: 700,
              minWidth: 28,
              bgcolor: alpha(KIND_COLORS[t.kind] ?? "#888", 0.15),
              color: KIND_COLORS[t.kind] ?? "#888",
            }}
          />
          <Typography sx={{ fontSize: "0.78rem", fontFamily: "monospace", fontWeight: 500 }}>
            {t.name}
          </Typography>
          <Typography sx={{ fontSize: "0.65rem", color: "text.secondary", flex: 1, textAlign: "right" }}>
            {t.fields.length > 0 ? `${t.fields.length}f` : t.enumValues.length > 0 ? `${t.enumValues.length}v` : ""}
          </Typography>
        </Box>
      ))}
    </Box>
  );

  // Type detail view
  if (selectedType && schema.types[selectedType]) {
    return (
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Box sx={{ overflow: "auto", flex: 1 }}>
          {renderTypeDetail(schema.types[selectedType])}
        </Box>
      </Box>
    );
  }

  // Overview with tabs
  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <TextField
        size="small"
        placeholder={t("graphql.explorerSearch")}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search sx={{ fontSize: 16, color: "text.secondary" }} />
            </InputAdornment>
          ),
        }}
        sx={{ mx: 0.5, mt: 0.5, "& .MuiInputBase-root": { height: 30, fontSize: "0.75rem" } }}
      />

      <Tabs
        value={explorerTab}
        onChange={(_, v) => setExplorerTab(v)}
        sx={{ minHeight: 28, px: 0.5, "& .MuiTab-root": { minHeight: 28, py: 0, fontSize: "0.7rem", minWidth: 0, px: 1 } }}
      >
        <Tab label={`Q (${queryFields.length})`} />
        <Tab label={`M (${mutationFields.length})`} disabled={mutationFields.length === 0} />
        <Tab label={`S (${subscriptionFields.length})`} disabled={subscriptionFields.length === 0} />
        <Tab label={t("graphql.explorerTypes")} />
      </Tabs>

      <Box sx={{ flex: 1, overflow: "auto", mt: 0.25 }}>
        {explorerTab === 0 && (
          filterFields(queryFields).length > 0
            ? filterFields(queryFields).map((f) => renderFieldRow(f, "query"))
            : <Typography sx={{ p: 1, fontSize: "0.75rem", color: "text.secondary" }}>{t("graphql.explorerNoResults")}</Typography>
        )}
        {explorerTab === 1 && (
          filterFields(mutationFields).length > 0
            ? filterFields(mutationFields).map((f) => renderFieldRow(f, "mutation"))
            : <Typography sx={{ p: 1, fontSize: "0.75rem", color: "text.secondary" }}>{t("graphql.explorerNoResults")}</Typography>
        )}
        {explorerTab === 2 && (
          filterFields(subscriptionFields).length > 0
            ? filterFields(subscriptionFields).map((f) => renderFieldRow(f, "subscription"))
            : <Typography sx={{ p: 1, fontSize: "0.75rem", color: "text.secondary" }}>{t("graphql.explorerNoResults")}</Typography>
        )}
        {explorerTab === 3 && (
          filteredTypes.length > 0
            ? renderTypeList(filteredTypes)
            : <Typography sx={{ p: 1, fontSize: "0.75rem", color: "text.secondary" }}>{t("graphql.explorerNoResults")}</Typography>
        )}
      </Box>
    </Box>
  );
}

export { generateQueryString, typeRefToString, unwrapType };
