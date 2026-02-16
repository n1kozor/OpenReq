import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export default function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const runStatus = (data as Record<string, unknown>)?._runStatus as string | undefined;
  const isActive = (data as Record<string, unknown>)?._isActive as boolean | undefined;

  let strokeColor = "#475569";
  let strokeDash = "none";
  let animated = false;

  if (runStatus === "success") {
    strokeColor = "#22c55e";
  } else if (runStatus === "error") {
    strokeColor = "#ef4444";
  } else if (runStatus === "skipped") {
    strokeColor = "#6b7280";
    strokeDash = "6 4";
  }

  if (isActive) {
    animated = true;
    strokeColor = "#eab308";
  }

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        ...style,
        strokeWidth: 2,
        stroke: strokeColor,
        strokeDasharray: strokeDash,
        animation: animated ? "flowPulse 0.6s ease-in-out infinite" : undefined,
      }}
    />
  );
}
