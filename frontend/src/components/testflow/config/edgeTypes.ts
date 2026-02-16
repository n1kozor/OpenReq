import AnimatedEdge from "../edges/AnimatedEdge";

export const edgeTypes = {
  animated: AnimatedEdge,
};

export const defaultEdgeOptions = {
  type: "animated",
  animated: false,
  style: { strokeWidth: 2, stroke: "#475569" },
};
