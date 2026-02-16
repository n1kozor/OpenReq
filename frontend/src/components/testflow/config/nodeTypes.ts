import type { TestFlowNodeType, TestFlowNodeConfig } from "@/types";

export interface NodeTypeConfig {
  type: TestFlowNodeType;
  icon: string;
  color: string;
  defaultLabel: string;
  labelKey: string;
  descriptionKey: string;
  defaultConfig: TestFlowNodeConfig;
}

export const NODE_TYPE_CONFIGS: Record<TestFlowNodeType, NodeTypeConfig> = {
  http_request: {
    type: "http_request",
    icon: "Http",
    color: "#22c55e",
    defaultLabel: "HTTP Request",
    labelKey: "testFlow.nodes.httpRequest",
    descriptionKey: "testFlow.nodeDescriptions.httpRequest",
    defaultConfig: {},
  },
  collection: {
    type: "collection",
    icon: "FolderOpen",
    color: "#3b82f6",
    defaultLabel: "Collection",
    labelKey: "testFlow.nodes.collection",
    descriptionKey: "testFlow.nodeDescriptions.collection",
    defaultConfig: {},
  },
  assertion: {
    type: "assertion",
    icon: "CheckCircle",
    color: "#a855f7",
    defaultLabel: "Assertion",
    labelKey: "testFlow.nodes.assertion",
    descriptionKey: "testFlow.nodeDescriptions.assertion",
    defaultConfig: { assertions: [] },
  },
  script: {
    type: "script",
    icon: "Code",
    color: "#f59e0b",
    defaultLabel: "Script",
    labelKey: "testFlow.nodes.script",
    descriptionKey: "testFlow.nodeDescriptions.script",
    defaultConfig: { script: "", language: "javascript" },
  },
  delay: {
    type: "delay",
    icon: "Timer",
    color: "#64748b",
    defaultLabel: "Delay",
    labelKey: "testFlow.nodes.delay",
    descriptionKey: "testFlow.nodeDescriptions.delay",
    defaultConfig: { delay_ms: 1000 },
  },
  condition: {
    type: "condition",
    icon: "CallSplit",
    color: "#ec4899",
    defaultLabel: "Condition",
    labelKey: "testFlow.nodes.condition",
    descriptionKey: "testFlow.nodeDescriptions.condition",
    defaultConfig: { expression: "status_code == 200" },
  },
  loop: {
    type: "loop",
    icon: "Loop",
    color: "#06b6d4",
    defaultLabel: "Loop",
    labelKey: "testFlow.nodes.loop",
    descriptionKey: "testFlow.nodeDescriptions.loop",
    defaultConfig: { mode: "count", count: 3, max_iterations: 100 },
  },
  set_variable: {
    type: "set_variable",
    icon: "DataObject",
    color: "#f97316",
    defaultLabel: "Set Variable",
    labelKey: "testFlow.nodes.setVariable",
    descriptionKey: "testFlow.nodeDescriptions.setVariable",
    defaultConfig: { assignments: [] },
  },
  group: {
    type: "group",
    icon: "SelectAll",
    color: "#6b7280",
    defaultLabel: "Group",
    labelKey: "testFlow.nodes.group",
    descriptionKey: "testFlow.nodeDescriptions.group",
    defaultConfig: { color: "#3b82f6", width: 400, height: 300 },
  },
};

export const DRAGGABLE_NODE_TYPES: TestFlowNodeType[] = [
  "http_request",
  "collection",
  "assertion",
  "script",
  "delay",
  "condition",
  "loop",
  "set_variable",
  "group",
];
