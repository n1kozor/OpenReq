import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Box, Typography, Chip } from "@mui/material";
import { CheckCircle, Cancel, HourglassEmpty } from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import { nodeStatusStyles } from "./shared";

export default function AssertionNode({ data, selected }: NodeProps) {
  const { t } = useTranslation();
  const d = data as Record<string, unknown>;
  const config = (d.config ?? {}) as Record<string, unknown>;
  const assertions = (config.assertions as unknown[]) || [];
  const runStatus = d._runStatus as string | undefined;
  const branchTaken = d._branchTaken as string | undefined;
  const assertionResults = d._assertionResults as { passed: boolean; name?: string }[] | undefined;

  const passedCount = assertionResults?.filter((a) => a.passed).length ?? 0;
  const failedCount = assertionResults ? assertionResults.length - passedCount : 0;
  const totalCount = assertionResults?.length ?? assertions.length;
  const allPassed = assertionResults ? failedCount === 0 : false;

  // Choose icon based on run outcome
  let icon = <CheckCircle sx={{ fontSize: 16, color: "#a855f7" }} />;
  if (runStatus === "success" && assertionResults) {
    icon = allPassed
      ? <CheckCircle sx={{ fontSize: 16, color: "#22c55e" }} />
      : <Cancel sx={{ fontSize: 16, color: "#ef4444" }} />;
  } else if (runStatus === "error") {
    icon = <Cancel sx={{ fontSize: 16, color: "#ef4444" }} />;
  } else if (runStatus === "running") {
    icon = <HourglassEmpty sx={{ fontSize: 16, color: "#eab308" }} />;
  }

  return (
    <Box sx={{ ...nodeStatusStyles(runStatus, selected, "#a855f7"), minWidth: 180 }}>
      <Handle type="target" position={Position.Top} />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, pb: 0.25 }}>
        {icon}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {(d.label as string) || "Assertion"}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "#a855f7", opacity: 0.7 }}>
            {t("testFlow.nodeConfig.assertionSubtitle")}
          </Typography>
        </Box>
        {totalCount > 0 && (
          <Chip
            label={assertionResults ? `${passedCount}/${totalCount}` : `${totalCount}`}
            size="small"
            color={assertionResults ? (allPassed ? "success" : "error") : "default"}
            sx={{ fontSize: "0.65rem", height: 18 }}
          />
        )}
      </Box>

      {/* Show individual assertion results after run */}
      {assertionResults && assertionResults.length > 0 && (
        <Box sx={{ px: 1, pb: 0.75, display: "flex", flexDirection: "column", gap: 0.25 }}>
          {assertionResults.map((a, i) => (
            <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box
                component="span"
                sx={{
                  fontSize: "0.6rem",
                  lineHeight: 1,
                  color: a.passed ? "#22c55e" : "#ef4444",
                }}
              >
                {a.passed ? "\u2714" : "\u2718"}
              </Box>
              <Typography
                variant="caption"
                noWrap
                sx={{
                  fontSize: "0.6rem",
                  color: a.passed ? "text.secondary" : "#ef4444",
                  maxWidth: 140,
                }}
              >
                {a.name || `Check ${i + 1}`}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Branch taken indicator (after run) */}
      {branchTaken && (
        <Box sx={{ px: 1, pb: 0.5, textAlign: "center" }}>
          <Typography variant="caption" color={branchTaken === "true" ? "success.main" : "error.main"} fontWeight={700}>
            {branchTaken === "true" ? t("testFlow.nodeConfig.trueBranch") : t("testFlow.nodeConfig.falseBranch")}
          </Typography>
        </Box>
      )}

      {/* Two outputs: TRUE (passed) and FALSE (failed) */}
      <Box sx={{ display: "flex", justifyContent: "space-between", px: 1, pb: 0.5 }}>
        <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "#22c55e" }}>
          {t("testFlow.nodeConfig.trueBranch")}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: "0.6rem", color: "#ef4444" }}>
          {t("testFlow.nodeConfig.falseBranch")}
        </Typography>
      </Box>
      <Handle type="source" position={Position.Bottom} id="source-true" style={{ left: "30%" }} />
      <Handle type="source" position={Position.Bottom} id="source-false" style={{ left: "70%" }} />
    </Box>
  );
}
