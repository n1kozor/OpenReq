import { memo, useState } from "react";
import {
  Box,
  IconButton,
  Collapse,
  Tooltip,
} from "@mui/material";
import {
  ExpandMore,
  ChevronRight,
  ContentCopy,
} from "@mui/icons-material";

interface JsonTreeViewProps {
  data: unknown;
  rootName?: string;
}

function JsonNode({
  name,
  value,
  depth,
  isLast,
}: {
  name: string | number | null;
  value: unknown;
  depth: number;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(depth < 2);

  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);
  const entries = isObject
    ? isArray
      ? (value as unknown[]).map((v, i) => [i, v] as [number, unknown])
      : Object.entries(value as Record<string, unknown>)
    : [];
  const count = entries.length;

  const renderValue = (v: unknown) => {
    if (v === null) return <span style={{ color: "#808080" }}>null</span>;
    if (typeof v === "string")
      return (
        <span style={{ color: "#ce9178" }}>
          &quot;{v.length > 200 ? v.slice(0, 200) + "..." : v}&quot;
        </span>
      );
    if (typeof v === "number")
      return <span style={{ color: "#b5cea8" }}>{String(v)}</span>;
    if (typeof v === "boolean")
      return (
        <span style={{ color: "#569cd6" }}>{String(v)}</span>
      );
    return <span>{String(v)}</span>;
  };

  const comma = isLast ? "" : ",";

  if (!isObject) {
    return (
      <Box
        sx={{
          pl: depth * 2.5,
          py: 0.1,
          fontFamily: "monospace",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        {name !== null && (
          <span style={{ color: "#9cdcfe" }}>
            &quot;{name}&quot;:{" "}
          </span>
        )}
        {renderValue(value)}
        <span style={{ color: "#808080" }}>{comma}</span>
      </Box>
    );
  }

  const openBracket = isArray ? "[" : "{";
  const closeBracket = isArray ? "]" : "}";

  return (
    <Box>
      <Box
        sx={{
          pl: depth * 2.5,
          py: 0.1,
          fontFamily: "monospace",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          "&:hover": { bgcolor: "action.hover" },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ExpandMore sx={{ fontSize: 14, mr: 0.25 }} />
        ) : (
          <ChevronRight sx={{ fontSize: 14, mr: 0.25 }} />
        )}
        {name !== null && (
          <span style={{ color: "#9cdcfe" }}>
            &quot;{name}&quot;:{" "}
          </span>
        )}
        <span>{openBracket}</span>
        {!expanded && (
          <span style={{ color: "#808080" }}>
            {" "}
            {count} {count === 1 ? "item" : "items"} {closeBracket}
            {comma}
          </span>
        )}
      </Box>

      <Collapse in={expanded}>
        {entries.map(([key, val], index) => (
          <JsonNode
            key={String(key)}
            name={isArray ? null : (key as string)}
            value={val}
            depth={depth + 1}
            isLast={index === entries.length - 1}
          />
        ))}
      </Collapse>

      {expanded && (
        <Box
          sx={{
            pl: depth * 2.5,
            py: 0.1,
            fontFamily: "monospace",
            fontSize: 12,
          }}
        >
          <span>
            {closeBracket}
            {comma}
          </span>
        </Box>
      )}
    </Box>
  );
}

function JsonTreeView({
  data,
  rootName,
}: JsonTreeViewProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  };

  return (
    <Box sx={{ position: "relative" }}>
      <Tooltip title="Copy JSON">
        <IconButton
          size="small"
          onClick={handleCopy}
          sx={{ position: "absolute", top: 0, right: 0, zIndex: 1 }}
        >
          <ContentCopy sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      <Box sx={{ maxHeight: 400, overflow: "auto", py: 0.5 }}>
        <JsonNode
          name={rootName ?? null}
          value={data}
          depth={0}
          isLast={true}
        />
      </Box>
    </Box>
  );
}

export default memo(JsonTreeView);
