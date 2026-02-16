import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type OnConnect,
  type EdgeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  Box, Snackbar, Alert, Menu, MenuItem, ListItemIcon, ListItemText, Divider,
} from "@mui/material";
import {
  Delete, ContentCopy, SelectAll, Edit,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";

import { testFlowsApi } from "@/api/endpoints";
import type { Collection, CollectionItem, Environment, TestFlow, TestFlowNodeData, TestFlowEdgeData } from "@/types";
import { NODE_TYPE_CONFIGS } from "./config/nodeTypes";
import { edgeTypes, defaultEdgeOptions } from "./config/edgeTypes";
import TestFlowToolbar from "./TestFlowToolbar";
import TestFlowPalette from "./TestFlowPalette";
import TestFlowNodeInspector from "./TestFlowNodeInspector";
import TestFlowRunReportView from "./TestFlowRunReportView";

import HttpRequestNode from "./nodes/HttpRequestNode";
import CollectionNode from "./nodes/CollectionNode";
import AssertionNode from "./nodes/AssertionNode";
import ScriptNode from "./nodes/ScriptNode";
import DelayNode from "./nodes/DelayNode";
import ConditionNode from "./nodes/ConditionNode";
import LoopNode from "./nodes/LoopNode";
import SetVariableNode from "./nodes/SetVariableNode";
import GroupNode from "./nodes/GroupNode";

const nodeTypes = {
  http_request: HttpRequestNode,
  collection: CollectionNode,
  assertion: AssertionNode,
  script: ScriptNode,
  delay: DelayNode,
  condition: ConditionNode,
  loop: LoopNode,
  set_variable: SetVariableNode,
  group: GroupNode,
};

interface TestFlowCanvasProps {
  flowId: string;
  environments: Environment[];
  selectedEnvId: string | null;
  collections: Collection[];
  collectionItems: Record<string, CollectionItem[]>;
  onLoadAllItems?: () => void;
  onOpenRequest?: (requestId: string, collectionId?: string) => void;
}

let nodeCounter = 0;

export default function TestFlowCanvas({
  flowId,
  environments,
  selectedEnvId: initialEnvId,
  collections,
  collectionItems,
  onLoadAllItems,
  onOpenRequest,
}: TestFlowCanvasProps) {
  const { t } = useTranslation();
  const reactFlowInstance = useReactFlow();

  // Load all collection items on mount so inspector request picker is populated
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!loadedRef.current && onLoadAllItems) {
      loadedRef.current = true;
      onLoadAllItems();
    }
  }, [onLoadAllItems]);

  // Flow data
  const [flow, setFlow] = useState<TestFlow | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([] as Edge[]);
  const [isDirty, setIsDirty] = useState(false);
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(initialEnvId);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: "success" | "error" } | null>(null);

  // Inspector
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Run report
  const [reportRunId, setReportRunId] = useState<string | null>(null);

  // Collect results from SSE events (avoids stale closure over `nodes`)
  const runResultsRef = useRef<Record<string, Record<string, unknown>>>({});

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    position: { top: number; left: number };
    type: "node" | "edge" | "pane";
    targetId?: string;
  } | null>(null);

  // Undo/redo
  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const historyIndexRef = useRef(-1);
  const skipHistoryRef = useRef(false);

  // ── Load flow ──
  useEffect(() => {
    testFlowsApi.get(flowId).then(({ data }) => {
      setFlow(data);
      const rfNodes = data.nodes.map(toReactFlowNode);
      const rfEdges = data.edges.map(toReactFlowEdge);
      setNodes(rfNodes);
      setEdges(rfEdges);
      // Initialize history
      historyRef.current = [{ nodes: rfNodes, edges: rfEdges }];
      historyIndexRef.current = 0;
      if (data.viewport) {
        setTimeout(() => {
          reactFlowInstance.setViewport(data.viewport!);
        }, 100);
      }
    });
  }, [flowId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dirty tracking & history ──
  const pushHistory = useCallback(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    const snapshot = { nodes: [...nodes], edges: [...edges] };
    const idx = historyIndexRef.current;
    historyRef.current = historyRef.current.slice(0, idx + 1);
    historyRef.current.push(snapshot);
    historyIndexRef.current = historyRef.current.length - 1;
    setIsDirty(true);
  }, [nodes, edges]);

  // ── Auto-save (debounced) ──
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isDirty || !flow) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 2000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [isDirty, nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, type: "animated", id: `e-${crypto.randomUUID()}` }, eds));
      setIsDirty(true);
      pushHistory();
    },
    [setEdges, pushHistory],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (!onOpenRequest) return;
    const d = node.data as Record<string, unknown>;
    const config = (d.config ?? {}) as Record<string, unknown>;
    // Open the request tab for http_request nodes that reference a saved request
    if (node.type === "http_request" && config.request_id) {
      onOpenRequest(config.request_id as string, config.collection_id as string | undefined);
    }
  }, [onOpenRequest]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // 1) Palette drag — standard node type
      const nodeType = event.dataTransfer.getData("application/reactflow-type");
      if (nodeType) {
        const cfg = NODE_TYPE_CONFIGS[nodeType as keyof typeof NODE_TYPE_CONFIGS];
        if (!cfg) return;
        const id = `node-${++nodeCounter}-${crypto.randomUUID().slice(0, 8)}`;
        const newNode: Node = {
          id,
          type: nodeType,
          position,
          data: {
            node_type: nodeType,
            label: cfg.defaultLabel,
            config: { ...cfg.defaultConfig },
          },
        };
        setNodes((nds) => [...nds, newNode]);
        setIsDirty(true);
        setSelectedNodeId(id);
        pushHistory();
        return;
      }

      // 2) Sidebar drag — request or collection item
      const sidebarData = event.dataTransfer.getData("application/openreq-item");
      if (sidebarData) {
        try {
          const payload = JSON.parse(sidebarData) as { itemId: string; collectionId: string };
          const items = collectionItems[payload.collectionId] || [];
          const flat = flattenCollectionItems(items);
          const item = flat.find((i) => i.id === payload.itemId);
          if (!item) return;

          const id = `node-${++nodeCounter}-${crypto.randomUUID().slice(0, 8)}`;

          if (item.is_folder) {
            // Folder → collection node
            const col = collections.find((c) => c.id === payload.collectionId);
            const newNode: Node = {
              id,
              type: "collection",
              position,
              data: {
                node_type: "collection",
                label: item.name,
                config: {
                  collection_id: payload.collectionId,
                  collection_name_hint: col?.name || item.name,
                },
              },
            };
            setNodes((nds) => [...nds, newNode]);
          } else if (item.request_id) {
            // Request → http_request node
            const newNode: Node = {
              id,
              type: "http_request",
              position,
              data: {
                node_type: "http_request",
                label: item.name,
                config: {
                  request_id: item.request_id,
                  request_name_hint: item.name,
                  method: item.method || "GET",
                },
              },
            };
            setNodes((nds) => [...nds, newNode]);
          }
          setIsDirty(true);
          setSelectedNodeId(id);
          pushHistory();
        } catch {
          // ignore bad data
        }
        return;
      }

      // 3) Collection drag from sidebar tree header
      const collectionDrag = event.dataTransfer.getData("application/openreq-collection");
      if (collectionDrag) {
        try {
          const { collectionId } = JSON.parse(collectionDrag) as { collectionId: string };
          const col = collections.find((c) => c.id === collectionId);
          if (!col) return;
          const id = `node-${++nodeCounter}-${crypto.randomUUID().slice(0, 8)}`;
          const newNode: Node = {
            id,
            type: "collection",
            position,
            data: {
              node_type: "collection",
              label: col.name,
              config: {
                collection_id: col.id,
                collection_name_hint: col.name,
              },
            },
          };
          setNodes((nds) => [...nds, newNode]);
          setIsDirty(true);
          setSelectedNodeId(id);
          pushHistory();
        } catch {
          // ignore
        }
      }
    },
    [reactFlowInstance, setNodes, pushHistory, collectionItems, collections],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    const types = event.dataTransfer.types;
    if (
      types.includes("application/reactflow-type") ||
      types.includes("application/openreq-item") ||
      types.includes("application/openreq-collection")
    ) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }, []);

  const handleNodeDragStop = useCallback(() => {
    setIsDirty(true);
    pushHistory();
  }, [pushHistory]);

  const handleUpdateNode = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)),
      );
      setIsDirty(true);
    },
    [setNodes],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
      setIsDirty(true);
      pushHistory();
    },
    [setNodes, setEdges, pushHistory],
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
      setIsDirty(true);
      pushHistory();
    },
    [setEdges, pushHistory],
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const orig = nodes.find((n) => n.id === nodeId);
      if (!orig) return;
      const id = `node-${++nodeCounter}-${crypto.randomUUID().slice(0, 8)}`;
      const newNode: Node = {
        ...orig,
        id,
        position: { x: (orig.position?.x ?? 0) + 40, y: (orig.position?.y ?? 0) + 40 },
        selected: false,
        data: { ...orig.data },
      };
      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(id);
      setIsDirty(true);
      pushHistory();
    },
    [nodes, setNodes, pushHistory],
  );

  // ── Context menu handlers ──
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ position: { top: event.clientY, left: event.clientX }, type: "node", targetId: node.id });
    },
    [],
  );

  const onEdgeContextMenu: EdgeMouseHandler = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ position: { top: event.clientY, left: event.clientX }, type: "edge", targetId: edge.id });
    },
    [],
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      setContextMenu({ position: { top: event.clientY, left: event.clientX }, type: "pane" });
    },
    [],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // ── Edge reconnect (drag edge off to disconnect) ──
  const onReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, edge: Edge) => {
      // When user drags edge end and drops on empty space, delete the edge
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      setIsDirty(true);
      pushHistory();
    },
    [setEdges, pushHistory],
  );

  // ── Save ──
  const handleSave = useCallback(async () => {
    if (!flow) return;
    try {
      const viewport = reactFlowInstance.getViewport();
      const nodesData = nodes.map(fromReactFlowNode);
      const edgesData = edges.map(fromReactFlowEdge);

      await testFlowsApi.update(flow.id, {
        nodes: nodesData,
        edges: edgesData,
        viewport,
      });
      setIsDirty(false);
      setSnackbar({ message: t("testFlow.saved"), severity: "success" });
    } catch {
      setSnackbar({ message: t("testFlow.saveFailed"), severity: "error" });
    }
  }, [flow, nodes, edges, reactFlowInstance, t]);

  // ── Auto-layout (dagre) ──
  const handleAutoLayout = useCallback(() => {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", ranksep: 60, nodesep: 40 });

    for (const node of nodes) {
      g.setNode(node.id, { width: 200, height: 60 });
    }
    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }

    dagre.layout(g);

    setNodes((nds) =>
      nds.map((node) => {
        const pos = g.node(node.id);
        return pos
          ? { ...node, position: { x: pos.x - 100, y: pos.y - 30 } }
          : node;
      }),
    );
    setIsDirty(true);
    pushHistory();
    setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 50);
  }, [nodes, edges, setNodes, reactFlowInstance, pushHistory]);

  // ── Undo / Redo ──
  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const handleUndo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current--;
    const snap = historyRef.current[historyIndexRef.current];
    if (!snap) return;
    skipHistoryRef.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setIsDirty(true);
  }, [setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current++;
    const snap = historyRef.current[historyIndexRef.current];
    if (!snap) return;
    skipHistoryRef.current = true;
    setNodes(snap.nodes);
    setEdges(snap.edges);
    setIsDirty(true);
  }, [setNodes, setEdges]);

  // ── Export JSON ──
  const handleExportJson = useCallback(() => {
    if (!flow) return;
    const data = {
      name: flow.name,
      nodes: nodes.map(fromReactFlowNode),
      edges: edges.map(fromReactFlowEdge),
      variables: flow.variables,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${flow.name.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [flow, nodes, edges]);

  // ── Run flow ──
  const handleRun = useCallback(() => {
    if (!flow) return;
    setIsRunning(true);
    setSummary(null);

    // Clear previous run statuses + results ref
    runResultsRef.current = {};
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          _runStatus: undefined,
          _statusCode: undefined,
          _elapsedMs: undefined,
          _assertionResults: undefined,
          _branchTaken: undefined,
          _iterationsCompleted: undefined,
        },
      })),
    );
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        data: { ...e.data, _runStatus: undefined, _isActive: undefined },
      })),
    );

    let execCounter = 0;

    const ctrl = testFlowsApi.runStream(flow.id, selectedEnvId, {
      onStart: () => {},
      onNodeStart: (nodeId, nodeType, label) => {
        // Pre-populate ref with node metadata
        runResultsRef.current[nodeId] = {
          ...runResultsRef.current[nodeId],
          node_type: nodeType,
          node_label: label,
        };
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, _runStatus: "running" } }
              : n,
          ),
        );
      },
      onNodeResult: (nodeId, result) => {
        // Store result in ref for report saving (avoids stale closure)
        runResultsRef.current[nodeId] = {
          ...result,
          _execOrder: execCounter++,
        };
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    _runStatus: result.status as string,
                    _statusCode: result.status_code as number | undefined,
                    _elapsedMs: result.elapsed_ms as number | undefined,
                    _assertionResults: result.assertion_results as unknown[] | undefined,
                    _branchTaken: result.branch_taken as string | undefined,
                    _iterationsCompleted: result.iterations_completed as number | undefined,
                  },
                }
              : n,
          ),
        );
        // Update edges from this node
        const branchTaken = result.branch_taken as string | undefined;
        setEdges((eds) =>
          eds.map((e) => {
            if (e.source !== nodeId) return e;
            // For branching nodes (condition/assertion): active edge = green, inactive = skipped
            if (branchTaken) {
              const activeHandle = branchTaken === "true" ? "source-true" : "source-false";
              const inactiveHandle = branchTaken === "true" ? "source-false" : "source-true";
              if (e.sourceHandle === activeHandle) {
                // Active branch edge is always green — "flow went this way"
                return { ...e, data: { ...e.data, _runStatus: "success", _isActive: false } };
              }
              if (e.sourceHandle === inactiveHandle) {
                return { ...e, data: { ...e.data, _runStatus: "skipped", _isActive: false } };
              }
            }
            return { ...e, data: { ...e.data, _runStatus: result.status as string, _isActive: false } };
          }),
        );
      },
      onNodeSkipped: (nodeId) => {
        runResultsRef.current[nodeId] = { status: "skipped", _execOrder: execCounter++ };
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, _runStatus: "skipped" } }
              : n,
          ),
        );
      },
      onEdgeActive: (edgeId) => {
        setEdges((eds) =>
          eds.map((e) =>
            e.id === edgeId
              ? { ...e, data: { ...e.data, _isActive: true } }
              : e,
          ),
        );
        // Clear after animation
        setTimeout(() => {
          setEdges((eds) =>
            eds.map((e) =>
              e.id === edgeId
                ? { ...e, data: { ...e.data, _isActive: false } }
                : e,
            ),
          );
        }, 600);
      },
      onLoopIteration: () => {},
      onDone: (sum, finalVars) => {
        setIsRunning(false);
        setSummary(sum);
        // Auto-save run report using ref (not stale nodes closure)
        if (flow) {
          const s = sum as Record<string, number>;
          const collected = runResultsRef.current;
          const nodeResultsList = Object.entries(collected)
            .sort(([, a], [, b]) => ((a._execOrder as number) ?? 0) - ((b._execOrder as number) ?? 0))
            .map(([nodeId, r]) => ({
              node_id: nodeId,
              node_type: (r.node_type as string) || "",
              node_label: (r.node_label as string) || "",
              execution_order: (r._execOrder as number) ?? 0,
              iteration: 1,
              status: (r.status as string) || "success",
              elapsed_ms: (r.elapsed_ms as number) ?? null,
              status_code: (r.status_code as number) ?? null,
              assertion_results: (r.assertion_results as unknown[]) ?? null,
            }));

          testFlowsApi
            .saveRun(flow.id, {
              flow_name: flow.name,
              environment_id: selectedEnvId,
              environment_name: environments.find((e) => e.id === selectedEnvId)?.name || null,
              status: (s.failed_count ?? 0) > 0 ? "failed" : "completed",
              total_nodes: s.total_nodes ?? 0,
              passed_count: s.passed_count ?? 0,
              failed_count: s.failed_count ?? 0,
              skipped_count: s.skipped_count ?? 0,
              total_assertions: s.total_assertions ?? 0,
              passed_assertions: s.passed_assertions ?? 0,
              failed_assertions: s.failed_assertions ?? 0,
              total_time_ms: s.total_time_ms ?? 0,
              final_variables: finalVars,
              results: nodeResultsList,
            })
            .then(({ data: run }) => {
              setSnackbar({ message: t("testFlow.report.reportSaved"), severity: "success" });
              setReportRunId(run.id);
            })
            .catch(() => {});
        }
      },
      onError: (msg) => {
        setIsRunning(false);
        setSnackbar({ message: msg, severity: "error" });
      },
    });

    abortRef.current = ctrl;
  }, [flow, selectedEnvId, environments, t, setNodes, setEdges]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  if (!flow) return null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      <TestFlowToolbar
        flowName={flow.name}
        isDirty={isDirty}
        isRunning={isRunning}
        canUndo={canUndo}
        canRedo={canRedo}
        environments={environments}
        selectedEnvId={selectedEnvId}
        onEnvChange={setSelectedEnvId}
        onRun={handleRun}
        onStop={handleStop}
        onSave={handleSave}
        onAutoLayout={handleAutoLayout}
        onFitView={() => reactFlowInstance.fitView({ padding: 0.2 })}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExportJson={handleExportJson}
        summary={summary as TestFlowCanvasProps["environments"] extends never ? never : typeof summary extends null ? null : {
          total_nodes: number;
          passed_count: number;
          failed_count: number;
          skipped_count: number;
          total_time_ms: number;
        } | null}
      />
      <Box sx={{ flex: 1, display: "flex", position: "relative" }}>
        {/* Palette */}
        <Box
          sx={{
            width: 200,
            borderRight: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <TestFlowPalette />
        </Box>

        {/* Canvas */}
        <Box sx={{ flex: 1, position: "relative", bgcolor: "#0f172a" }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onPaneClick={onPaneClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeDragStop={handleNodeDragStop}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            edgesReconnectable
            onReconnectEnd={onReconnectEnd}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            snapToGrid
            snapGrid={[16, 16]}
            fitView
            deleteKeyCode={["Delete", "Backspace"]}
            onDelete={() => {
              setIsDirty(true);
              pushHistory();
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="rgba(255,255,255,0.05)" />
            <Controls
              showInteractive={false}
              style={{ bottom: 10, left: 10 }}
              className="rf-controls-dark"
            />
            <MiniMap
              style={{
                backgroundColor: "rgba(15,23,42,0.9)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
              }}
              maskColor="rgba(0,0,0,0.6)"
              nodeStrokeWidth={2}
              nodeColor="#475569"
              pannable
              zoomable
            />
          </ReactFlow>

          {/* CSS for edge animation + node pulse + dark mode controls */}
          <style>{`
            @keyframes flowPulse {
              0% { stroke-dashoffset: 24; }
              100% { stroke-dashoffset: 0; }
            }
            @keyframes nodeRunningPulse {
              0%, 100% { box-shadow: 0 0 8px rgba(234,179,8,0.2); }
              50% { box-shadow: 0 0 20px rgba(234,179,8,0.5); }
            }
            .react-flow__panel { }
            .rf-controls-dark button {
              background-color: rgba(30, 41, 59, 0.95) !important;
              color: #e2e8f0 !important;
              border: 1px solid rgba(148, 163, 184, 0.15) !important;
              border-bottom: none !important;
            }
            .rf-controls-dark button:hover {
              background-color: rgba(51, 65, 85, 0.95) !important;
            }
            .rf-controls-dark button:first-child {
              border-radius: 6px 6px 0 0 !important;
            }
            .rf-controls-dark button:last-child {
              border-radius: 0 0 6px 6px !important;
              border-bottom: 1px solid rgba(148, 163, 184, 0.15) !important;
            }
            .rf-controls-dark button svg {
              fill: #94a3b8 !important;
            }
            .rf-controls-dark button:hover svg {
              fill: #e2e8f0 !important;
            }
          `}</style>
        </Box>

        {/* Inspector */}
        {selectedNode && (
          <TestFlowNodeInspector
            node={selectedNode}
            collections={collections}
            collectionItems={collectionItems}
            onUpdateNode={handleUpdateNode}
            onDeleteNode={handleDeleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </Box>

      {/* Run report viewer */}
      <TestFlowRunReportView
        runId={reportRunId}
        open={!!reportRunId}
        onClose={() => setReportRunId(null)}
      />

      {/* Snackbar */}
      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {snackbar ? (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)} variant="filled">
            {snackbar.message}
          </Alert>
        ) : undefined}
      </Snackbar>

      {/* ── Context Menu ── */}
      <Menu
        anchorReference="anchorPosition"
        anchorPosition={contextMenu?.position}
        open={!!contextMenu}
        onClose={closeContextMenu}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        {contextMenu?.type === "node" && [
          <MenuItem
            key="edit"
            onClick={() => {
              if (contextMenu.targetId) setSelectedNodeId(contextMenu.targetId);
              closeContextMenu();
            }}
          >
            <ListItemIcon><Edit fontSize="small" /></ListItemIcon>
            <ListItemText>{t("testFlow.inspector")}</ListItemText>
          </MenuItem>,
          <MenuItem
            key="duplicate"
            onClick={() => {
              if (contextMenu.targetId) handleDuplicateNode(contextMenu.targetId);
              closeContextMenu();
            }}
          >
            <ListItemIcon><ContentCopy fontSize="small" /></ListItemIcon>
            <ListItemText>{t("testFlow.duplicateNode")}</ListItemText>
          </MenuItem>,
          <Divider key="div" />,
          <MenuItem
            key="delete"
            onClick={() => {
              if (contextMenu.targetId) handleDeleteNode(contextMenu.targetId);
              closeContextMenu();
            }}
          >
            <ListItemIcon><Delete fontSize="small" color="error" /></ListItemIcon>
            <ListItemText sx={{ color: "error.main" }}>{t("testFlow.deleteNode")}</ListItemText>
          </MenuItem>,
        ]}
        {contextMenu?.type === "edge" && (
          <MenuItem
            onClick={() => {
              if (contextMenu.targetId) handleDeleteEdge(contextMenu.targetId);
              closeContextMenu();
            }}
          >
            <ListItemIcon><Delete fontSize="small" color="error" /></ListItemIcon>
            <ListItemText sx={{ color: "error.main" }}>{t("testFlow.deleteEdge")}</ListItemText>
          </MenuItem>
        )}
        {contextMenu?.type === "pane" && (
          <MenuItem
            onClick={() => {
              reactFlowInstance.fitView({ padding: 0.2 });
              closeContextMenu();
            }}
          >
            <ListItemIcon><SelectAll fontSize="small" /></ListItemIcon>
            <ListItemText>{t("testFlow.selectAll")}</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}

// ── Converters ──

function toReactFlowNode(n: TestFlowNodeData): Node {
  return {
    id: n.id,
    type: n.node_type,
    position: { x: n.position_x, y: n.position_y },
    data: {
      node_type: n.node_type,
      label: n.label,
      config: n.config,
    },
    parentId: n.parent_node_id || undefined,
  };
}

function toReactFlowEdge(e: TestFlowEdgeData): Edge {
  return {
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    sourceHandle: e.source_handle || undefined,
    targetHandle: e.target_handle || undefined,
    label: e.label || undefined,
    type: "animated",
    data: {},
  };
}

function fromReactFlowNode(n: Node): unknown {
  const d = n.data as Record<string, unknown>;
  return {
    id: n.id,
    node_type: d.node_type || n.type,
    label: d.label || "",
    position_x: n.position?.x ?? 0,
    position_y: n.position?.y ?? 0,
    config: d.config || {},
    parent_node_id: n.parentId || null,
  };
}

function fromReactFlowEdge(e: Edge): unknown {
  return {
    id: e.id,
    source_node_id: e.source,
    target_node_id: e.target,
    source_handle: e.sourceHandle || null,
    target_handle: e.targetHandle || null,
    label: e.label || null,
  };
}

function flattenCollectionItems(items: CollectionItem[]): CollectionItem[] {
  const result: CollectionItem[] = [];
  for (const item of items) {
    result.push(item);
    if (item.children) {
      result.push(...flattenCollectionItems(item.children));
    }
  }
  return result;
}
