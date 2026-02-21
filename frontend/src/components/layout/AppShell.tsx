import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Box, Toolbar, Snackbar, Alert, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import TopBar from "./TopBar";
// StatusBar removed — all selectors moved to TopBar
// NavRail removed — nav items moved to TopBar
import Sidebar from "./Sidebar";
import TabBar from "./TabBar";
import RequestBuilder from "@/components/request/RequestBuilder";
import ResponsePanel from "@/components/request/ResponsePanel";
import WebSocketBuilder from "@/components/request/WebSocketBuilder";
import GraphQLBuilder from "@/components/request/GraphQLBuilder";
import CollectionDetail from "@/components/collection/CollectionDetail";
import FolderDetail from "@/components/collection/FolderDetail";
import Dashboard from "@/components/dashboard/Dashboard";
import {
  CreateCollectionDialog,
  EditCollectionDialog,
  CreateFolderDialog,
  RenameDialog,
  ConfirmDeleteDialog,
  SaveRequestDialog,
  DuplicateCollectionDialog,
} from "@/components/collection/CollectionDialogs";
import EnvironmentManager from "@/components/environment/EnvironmentManager";
import AICollectionWizard from "@/components/collection/AICollectionWizard";
import HistoryPanel from "@/components/history/HistoryPanel";
import WorkspaceManager from "@/components/workspace/WorkspaceManager";
import ImportExportDialog from "@/components/import/ImportExportDialog";
import SDKGeneratorDialog from "@/components/sdk/SDKGeneratorDialog";
import CollectionRunnerDialog from "@/components/collection/CollectionRunnerDialog";
import DocGeneratorDialog from "@/components/collection/DocGeneratorDialog";
import ShareManageDialog from "@/components/share/ShareManageDialog";
import ScriptEditor from "@/components/request/ScriptEditor";
import PanelGridLayout from "./PanelGridLayout";
import AIAgentDrawer, { DRAWER_WIDTH, type ApplyScriptPayload } from "@/components/ai/AIAgentDrawer";
import TestFlowCanvas from "@/components/testflow/TestFlowCanvas";
import TestFlowListDialog from "@/components/testflow/TestFlowListDialog";
import { ReactFlowProvider } from "@xyflow/react";
import SettingsPage from "@/pages/Settings";
import { newPair } from "@/components/common/KeyValueEditor";
import {
  collectionsApi,
  requestsApi,
  proxyApi,
  environmentsApi,
  workspacesApi,
  importExportApi,
} from "@/api/endpoints";
import { useVariableGroups } from "@/hooks/useVariableGroups";
import { ProxyModeContext, useProxyModeProvider } from "@/hooks/useProxyMode";
import { executeViaExtension, executeViaDesktop } from "@/services/localProxyExecutor";
import type {
  RequestTab,
  HttpMethod,
  BodyType,
  AuthType,
  Protocol,
  Collection,
  CollectionItem,
  Environment,
  Workspace,
  User,
  OAuthConfig,
  SentRequestSnapshot,
} from "@/types";
import { defaultRequestSettings } from "@/types";

interface AppShellProps {
  mode: "dark" | "light";
  onToggleTheme: () => void;
  onLogout: () => void;
  user: User;
}

let tabCounter = 1;

const TABS_STORAGE_KEY = "openreq-tabs";
const ACTIVE_TAB_STORAGE_KEY = "openreq-active-tab";
const VIEW_STORAGE_KEY = "openreq-view";

const defaultOAuthConfig: OAuthConfig = {
  grantType: "authorization_code",
  authUrl: "",
  tokenUrl: "",
  clientId: "",
  clientSecret: "",
  redirectUri: "http://localhost:5173/oauth/callback",
  scope: "",
  usePkce: false,
  accessToken: "",
};

function createNewTab(protocol: Protocol = "http"): RequestTab {
  return {
    id: `tab-${tabCounter++}`,
    name: protocol === "websocket" ? "New WebSocket" : protocol === "graphql" ? "New GraphQL" : "New Request",
    method: protocol === "graphql" ? "POST" : "GET",
    url: protocol === "websocket" ? "wss://" : "",
    protocol,
    isDirty: false,
    headers: [newPair()],
    queryParams: [newPair()],
    body: "",
    bodyType: protocol === "graphql" ? "graphql" : "none",
    formData: [newPair()],
    authType: "none",
    bearerToken: "",
    basicUsername: "",
    basicPassword: "",
    apiKeyName: "X-API-Key",
    apiKeyValue: "",
    apiKeyPlacement: "header",
    oauthConfig: { ...defaultOAuthConfig },
    requestSettings: { ...defaultRequestSettings },
    pathParams: {},
    preRequestScript: "",
    postResponseScript: "",
    scriptLanguage: "javascript",
    envOverrideId: null,
    response: null,
    responseTimestamp: null,
    scriptResult: null,
    preRequestResult: null,
    sentRequest: null,
    graphqlQuery: protocol === "graphql" ? "query {\n  \n}" : "",
    graphqlVariables: protocol === "graphql" ? "{}" : "",
    wsMessages: [],
    wsConnected: false,
  };
}

function stripRuntimeTab(tab: RequestTab): RequestTab {
  return {
    ...tab,
    response: null,
    responseTimestamp: null,
    scriptResult: null,
    preRequestResult: null,
    sentRequest: null,
    wsMessages: [],
    wsConnected: false,
    // Strip File objects from formData (not serializable)
    formData: tab.formData.map((f) => ({ ...f, file: null })),
  };
}

function createCollectionTab(collectionId: string, collectionName: string): RequestTab {
  return {
    ...createNewTab(),
    tabType: "collection",
    collectionId,
    name: collectionName,
  };
}

function createTestFlowTab(flowId: string, flowName: string): RequestTab {
  return {
    ...createNewTab(),
    tabType: "testflow",
    collectionId: flowId,
    name: flowName,
  };
}

function createFolderTab(folderId: string, folderName: string, parentCollectionId: string): RequestTab {
  return {
    ...createNewTab(),
    tabType: "folder",
    collectionId: folderId,
    parentCollectionId,
    name: folderName,
  };
}

function restoreTabs(): RequestTab[] {
  try {
    const raw = localStorage.getItem(TABS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RequestTab[];
      if (Array.isArray(parsed) && parsed.length >= 0) {
        let maxId = 0;
        for (const t of parsed) {
          const match = /^tab-(\d+)$/.exec(t.id);
          if (match) {
            const num = Number(match[1]);
            if (!Number.isNaN(num)) maxId = Math.max(maxId, num);
          }
        }
        tabCounter = Math.max(tabCounter, maxId + 1);
        return parsed.map(stripRuntimeTab);
      }
    }
  } catch {
    /* ignore restore errors */
  }
  return [];
}

type View = "request" | "settings";

export default function AppShell({ mode, onToggleTheme, onLogout, user }: AppShellProps) {
  const { t } = useTranslation();
  const proxyModeValue = useProxyModeProvider();
  const { proxyMode, localChannel } = proxyModeValue;
  const initialTabs = useMemo(() => restoreTabs(), []);
  const [view, setView] = useState<View>(() => {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    return saved === "settings" ? "settings" : "request";
  });
  const [tabs, setTabs] = useState<RequestTab[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const saved = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (saved && initialTabs.find((t) => t.id === saved)) return saved;
    return initialTabs[0]?.id ?? "";
  });
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; severity: "success" | "error" } | null>(null);

  // Data state
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionItems, setCollectionItems] = useState<Record<string, CollectionItem[]>>({});
  const [collectionTrees, setCollectionTrees] = useState<Record<string, CollectionItem[]>>({});
  const [collectionTreeLoading, setCollectionTreeLoading] = useState<Record<string, boolean>>({});
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(
    () => localStorage.getItem("openreq-env") ?? null
  );
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceGlobals, setWorkspaceGlobals] = useState<Record<string, string>>({});
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    () => localStorage.getItem("openreq-workspace") ?? null
  );

  // Dialog state
  const [showCreateCol, setShowCreateCol] = useState(false);
  const [showEditCol, setShowEditCol] = useState<{ id: string; name: string; description?: string; visibility: "private" | "shared"; variables?: Record<string, string> | null } | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState<{ collectionId: string; parentId: string | null } | null>(null);
  const [showRename, setShowRename] = useState<{ id: string; name: string; type: "collection" | "item" } | null>(null);
  const [showDelete, setShowDelete] = useState<{ id: string; name: string; type: "collection" | "item" } | null>(null);
  const [showDuplicateCol, setShowDuplicateCol] = useState<{ id: string; name: string } | null>(null);
  const [showSaveRequest, setShowSaveRequest] = useState(false);
  const [saveTarget, setSaveTarget] = useState<{ collectionId?: string; folderId?: string } | null>(null);
  const [cloneSource, setCloneSource] = useState<{ requestId: string; name: string } | null>(null);
  const [showEnvManager, setShowEnvManager] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [showAIWizard, setShowAIWizard] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSDK, setShowSDK] = useState(false);
  const [showAIAgent, setShowAIAgent] = useState(false);
  const [showCollectionsSidebar, setShowCollectionsSidebar] = useState(() => {
    return localStorage.getItem("openreq-collections-sidebar") !== "false";
  });
  const [showTestFlowList, setShowTestFlowList] = useState(false);
  const [showRunner, setShowRunner] = useState<{ id: string; name: string } | null>(null);
  const [showDocGen, setShowDocGen] = useState<{
    collectionId: string;
    collectionName: string;
    folderId?: string;
    folderName?: string;
  } | null>(null);
  const [showShareDocs, setShowShareDocs] = useState<{
    collectionId: string;
    collectionName: string;
    folderId?: string | null;
    folderName?: string | null;
  } | null>(null);
  const didInitCollections = useRef(false);
  const didInitWorkspaces = useRef(false);
  const lastEnvWorkspaceId = useRef<string | null>(null);
  const loadingAllItemsRef = useRef(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  // Active tab's collection variables for variable highlighting
  const activeCollectionVars = useMemo(() => {
    // For folder tabs, use parentCollectionId to find the actual collection
    const colId = activeTab?.tabType === "folder" ? activeTab.parentCollectionId : activeTab?.collectionId;
    if (!colId) return {};
    return collections.find((c) => c.id === colId)?.variables ?? {};
  }, [activeTab?.collectionId, activeTab?.parentCollectionId, activeTab?.tabType, collections]);

  // Variable groups for ScriptEditor (RequestBuilder computes its own)
  const activeEnvIdResolved = activeTab?.envOverrideId ?? selectedEnvId;
  const activeEnvVariables = useMemo(() => {
    const env = environments.find((e) => e.id === activeEnvIdResolved);
    return env?.variables ?? [];
  }, [environments, activeEnvIdResolved]);
  const { groups: scriptVarGroups, resolved: scriptVarResolved } = useVariableGroups(
    activeEnvVariables,
    activeCollectionVars,
    workspaceGlobals,
  );

  // ── Load data ──
  const buildTree = useCallback((items: CollectionItem[]): CollectionItem[] => {
    const map = new Map<string, CollectionItem>();
    const roots: CollectionItem[] = [];
    for (const item of items) {
      map.set(item.id, { ...item, children: [] });
    }
    for (const item of map.values()) {
      if (item.parent_id && map.has(item.parent_id)) {
        map.get(item.parent_id)!.children!.push(item);
      } else {
        roots.push(item);
      }
    }
    const sortTree = (nodes: CollectionItem[]) => {
      nodes.sort((a, b) => a.sort_order - b.sort_order);
      for (const node of nodes) {
        if (node.children?.length) sortTree(node.children);
      }
    };
    sortTree(roots);
    return roots;
  }, []);

  const loadedCollectionIdsRef = useRef<string[]>([]);
  // Keep ref in sync with loaded collection IDs
  useEffect(() => {
    loadedCollectionIdsRef.current = Object.keys(collectionTrees);
  }, [collectionTrees]);

  const loadCollections = useCallback(async () => {
    try {
      const { data: cols } = await collectionsApi.list(currentWorkspaceId ?? undefined);
      setCollections(cols);
      // Reload trees for already-loaded collections (keeps sidebar open & fresh)
      const openIds = loadedCollectionIdsRef.current;
      await Promise.all(openIds.map((colId) =>
        collectionsApi.listItems(colId).then(({ data }) => {
          setCollectionItems((p) => ({ ...p, [colId]: data }));
          setCollectionTrees((p) => ({ ...p, [colId]: buildTree(data) }));
        }).catch(() => {}),
      ));
    } catch { /* ignore */ }
  }, [buildTree, currentWorkspaceId]);

  const loadCollectionTree = useCallback(async (collectionId: string) => {
    if (collectionTreeLoading[collectionId]) return;
    setCollectionTreeLoading((prev) => ({ ...prev, [collectionId]: true }));
    try {
      const { data } = await collectionsApi.listItems(collectionId);
      setCollectionItems((prev) => ({ ...prev, [collectionId]: data }));
      const tree = buildTree(data);
      setCollectionTrees((prev) => ({ ...prev, [collectionId]: tree }));
    } catch {
      // ignore
    } finally {
      setCollectionTreeLoading((prev) => ({ ...prev, [collectionId]: false }));
    }
  }, [collectionTreeLoading, buildTree]);

  const loadAllCollectionItems = useCallback(async () => {
    if (loadingAllItemsRef.current) return;
    loadingAllItemsRef.current = true;
    try {
      for (const col of collections) {
        await loadCollectionTree(col.id);
      }
    } finally {
      loadingAllItemsRef.current = false;
    }
  }, [collections, loadCollectionTree]);

  const loadEnvironments = useCallback(async () => {
    if (!currentWorkspaceId) {
      setEnvironments([]);
      return;
    }
    try {
      const { data } = await environmentsApi.list(currentWorkspaceId);
      setEnvironments(data);
      // Validate persisted env selection still exists
      setSelectedEnvId((prev) => {
        if (prev && !data.find((e) => e.id === prev)) {
          localStorage.removeItem("openreq-env");
          return null;
        }
        return prev;
      });
    } catch { /* ignore */ }
  }, [currentWorkspaceId]);

  const loadGlobals = useCallback(async () => {
    if (!currentWorkspaceId) { setWorkspaceGlobals({}); return; }
    try {
      const { data } = await workspacesApi.getGlobals(currentWorkspaceId);
      setWorkspaceGlobals(data.globals || {});
    } catch { setWorkspaceGlobals({}); }
  }, [currentWorkspaceId]);

  const loadWorkspaces = useCallback(async () => {
    try {
      const { data } = await workspacesApi.list();
      setWorkspaces(data);
      if (data.length === 0) return;

      const savedId = localStorage.getItem("openreq-workspace");
      const hasCurrent = !!currentWorkspaceId && data.some((w) => w.id === currentWorkspaceId);
      const hasSaved = !!savedId && data.some((w) => w.id === savedId);
      const nextId = hasCurrent ? currentWorkspaceId! : (hasSaved ? savedId! : data[0]!.id);

      if (!currentWorkspaceId || !hasCurrent || currentWorkspaceId !== nextId) {
        setCurrentWorkspaceId(nextId);
        localStorage.setItem("openreq-workspace", nextId);
      }
    } catch { /* ignore */ }
  }, [currentWorkspaceId]);

  useEffect(() => {
    if (didInitWorkspaces.current) return;
    didInitWorkspaces.current = true;
    loadWorkspaces();
  }, [loadWorkspaces]);
  useEffect(() => {
    if (didInitCollections.current) return;
    didInitCollections.current = true;
    loadCollections();
  }, [loadCollections]);

  // Ensure folder tabs can render even if the parent collection is collapsed in the sidebar.
  useEffect(() => {
    if (!activeTab || activeTab.tabType !== "folder") return;
    const parentColId = activeTab.parentCollectionId;
    if (!parentColId) return;
    if (!collectionItems[parentColId] && !collectionTreeLoading[parentColId]) {
      loadCollectionTree(parentColId);
    }
  }, [activeTab, collectionItems, collectionTreeLoading, loadCollectionTree]);
  // Reload collections when workspace changes
  const lastColWorkspaceId = useRef<string | null>(null);
  useEffect(() => {
    if (lastColWorkspaceId.current === currentWorkspaceId) return;
    lastColWorkspaceId.current = currentWorkspaceId;
    // Clear stale collection tree data from previous workspace
    setCollectionItems({});
    setCollectionTrees({});
    loadedCollectionIdsRef.current = [];
    loadCollections();
  }, [loadCollections, currentWorkspaceId]);
  useEffect(() => {
    if (lastEnvWorkspaceId.current === currentWorkspaceId) return;
    lastEnvWorkspaceId.current = currentWorkspaceId;
    loadEnvironments();
    loadGlobals();
  }, [loadEnvironments, loadGlobals, currentWorkspaceId]);

  // Persist tabs + view to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs.map(stripRuntimeTab)));
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId);
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* ignore persistence errors */
    }
  }, [tabs, activeTabId, view]);

  // ── Tab operations ──
  const updateTab = useCallback((id: string, patch: Partial<RequestTab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch, isDirty: true } : t)));
  }, []);

  const handleNewTab = useCallback((protocol: Protocol = "http") => {
    const t = createNewTab(protocol);
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
    setView("request");
  }, []);

  const handleCloseTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        setActiveTabId("");
        return [];
      }
      if (activeTabId === id) {
        setActiveTabId(next[next.length - 1]!.id);
      }
      return next;
    });
  }, [activeTabId]);

  const handleCloseOtherTabs = useCallback((id: string) => {
    setTabs((prev) => {
      const kept = prev.filter((t) => t.id === id);
      if (kept.length === 0) return prev;
      setActiveTabId(id);
      return kept;
    });
  }, []);

  const handleCloseAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId("");
  }, []);

  const handleDuplicateTab = useCallback((id: string) => {
    setTabs((prev) => {
      const source = prev.find((t) => t.id === id);
      if (!source) return prev;
      const dup = createNewTab();
      const copy: RequestTab = {
        ...source,
        id: dup.id,
        name: source.name,
        savedRequestId: undefined,
        isDirty: true,
        response: null,
        responseTimestamp: null,
        scriptResult: null,
        preRequestResult: null,
      };
      setActiveTabId(copy.id);
      return [...prev, copy];
    });
  }, []);

  // ── Rename tab (and persist to backend if saved) ──
  const handleRenameTab = useCallback(async (id: string, newName: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    updateTab(id, { name: newName });
    if (tab.savedRequestId) {
      try {
        // Update both the request name and the collection item name
        await requestsApi.update(tab.savedRequestId, { name: newName });
        // Find the collection item that references this request and rename it too
        for (const [, items] of Object.entries(collectionItems)) {
          const flat = items.flatMap(function flatten(it: CollectionItem): CollectionItem[] {
            return [it, ...(it.children ?? []).flatMap(flatten)];
          });
          const found = flat.find((i) => i.request_id === tab.savedRequestId);
          if (found) {
            await collectionsApi.updateItem(found.id, { name: newName });
            break;
          }
        }
        updateTab(id, { isDirty: false });
        loadCollections();
      } catch {
        setSnack({ msg: t("request.saveFailed"), severity: "error" });
      }
    }
  }, [tabs, updateTab, loadCollections, collectionItems]);

  // ── Clone request (create copy in same collection) ──
  const handleCloneRequest = useCallback(async (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab?.savedRequestId) return;
    try {
      const { data: srcReq } = await requestsApi.get(tab.savedRequestId);
      const cloneName = `${srcReq.name} (copy)`;
      const { data: newReq } = await requestsApi.create({
        name: cloneName,
        method: srcReq.method,
        url: srcReq.url,
        headers: srcReq.headers,
        body: srcReq.body,
        body_type: srcReq.body_type,
        auth_type: srcReq.auth_type,
        auth_config: srcReq.auth_config,
        query_params: srcReq.query_params,
        pre_request_script: srcReq.pre_request_script,
        post_response_script: srcReq.post_response_script,
        form_data: srcReq.form_data as any,
        settings: srcReq.settings as any,
        protocol: srcReq.protocol,
      });
      // Find collection item that references the saved request to get collectionId
      let targetCollectionId: string | undefined;
      for (const [colId, items] of Object.entries(collectionItems)) {
        const flat = items.flatMap(function flatten(it: CollectionItem): CollectionItem[] {
          return [it, ...(it.children ?? []).flatMap(flatten)];
        });
        const found = flat.find((i) => i.request_id === tab.savedRequestId);
        if (found) {
          targetCollectionId = colId;
          // Create the collection item in the same folder as the original
          await collectionsApi.createItem(colId, {
            name: cloneName,
            request_id: newReq.id,
            parent_id: found.parent_id || undefined,
          });
          break;
        }
      }
      // Open the cloned request in a new tab
      const newTab = createNewTab(tab.protocol);
      const clonedTab: RequestTab = {
        ...tab,
        id: newTab.id,
        name: cloneName,
        savedRequestId: newReq.id,
        collectionId: targetCollectionId,
        isDirty: false,
        response: null,
        responseTimestamp: null,
        scriptResult: null,
        preRequestResult: null,
      };
      setTabs((prev) => [...prev, clonedTab]);
      setActiveTabId(clonedTab.id);
      loadCollections();
      setSnack({ msg: t("request.saved"), severity: "success" });
    } catch {
      setSnack({ msg: t("request.saveFailed"), severity: "error" });
    }
  }, [tabs, collectionItems, createNewTab, loadCollections]);

  // ── Clone item from sidebar — opens Save dialog for destination pick ──
  const handleCloneItem = useCallback((_itemId: string, requestId: string, name: string) => {
    setCloneSource({ requestId, name: `${name} (copy)` });
    setShowSaveRequest(true);
  }, []);

  // ── Clone save handler — called from SaveRequestDialog when cloneSource is set ──
  const handleCloneSave = useCallback(async (name: string, collectionId: string, folderId?: string) => {
    if (!cloneSource) return;
    try {
      const { data: srcReq } = await requestsApi.get(cloneSource.requestId);
      const { data: newReq } = await requestsApi.create({
        name,
        method: srcReq.method,
        url: srcReq.url,
        headers: srcReq.headers,
        body: srcReq.body,
        body_type: srcReq.body_type,
        auth_type: srcReq.auth_type,
        auth_config: srcReq.auth_config,
        query_params: srcReq.query_params,
        pre_request_script: srcReq.pre_request_script,
        post_response_script: srcReq.post_response_script,
        form_data: srcReq.form_data as any,
        settings: srcReq.settings as any,
        protocol: srcReq.protocol,
      });
      await collectionsApi.createItem(collectionId, {
        name,
        request_id: newReq.id,
        parent_id: folderId || undefined,
      });
      setCloneSource(null);
      setShowSaveRequest(false);
      setSaveTarget(null);
      loadCollections();
      setSnack({ msg: t("request.saved"), severity: "success" });
    } catch {
      setSnack({ msg: t("request.saveFailed"), severity: "error" });
      setCloneSource(null);
      setShowSaveRequest(false);
    }
  }, [cloneSource, loadCollections]);

  // ── Helper: build auth config from tab fields ──
  const buildAuthConfig = useCallback((tab: RequestTab) => {
    let authType = tab.authType;
    const authConfig: Record<string, string> = {};
    if (tab.authType === "bearer") {
      authConfig.token = tab.bearerToken;
    } else if (tab.authType === "basic") {
      authConfig.username = tab.basicUsername;
      authConfig.password = tab.basicPassword;
    } else if (tab.authType === "api_key") {
      authConfig.key = tab.apiKeyName;
      authConfig.value = tab.apiKeyValue;
      authConfig.placement = tab.apiKeyPlacement;
    } else if (tab.authType === "oauth2" && tab.oauthConfig.accessToken) {
      authType = "bearer" as const;
      authConfig.token = tab.oauthConfig.accessToken;
    }
    return { authType, authConfig };
  }, []);

  // ── Helper: file to base64 ──
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  // ── Send request ──
  const handleSend = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab || !tab.url) return;

    const headers: Record<string, string> = {};
    for (const h of tab.headers) {
      if (h.enabled && h.key) headers[h.key] = h.value;
    }

    const queryParams: Record<string, string> = {};
    for (const p of tab.queryParams) {
      if (p.enabled && p.key) queryParams[p.key] = p.value;
    }

    let bodyToSend: string | undefined;
    let formDataToSend: { key: string; value: string; type: string; enabled: boolean; file_name?: string | null; file_content_base64?: string | null }[] | undefined;

    const hasUserContentType = tab.headers.some(
      (h) => h.enabled && h.key.toLowerCase() === "content-type",
    );

    // GraphQL: build JSON body from query + variables
    if (tab.protocol === "graphql") {
      let variables: Record<string, unknown> = {};
      try {
        if (tab.graphqlVariables?.trim()) {
          variables = JSON.parse(tab.graphqlVariables);
        }
      } catch { /* ignore parse errors */ }
      bodyToSend = JSON.stringify({ query: tab.graphqlQuery || "", variables });
      if (!hasUserContentType) {
        headers["Content-Type"] = "application/json";
      }
    } else if (tab.bodyType === "json" || tab.bodyType === "xml" || tab.bodyType === "text") {
      bodyToSend = tab.body || undefined;
      if (bodyToSend && !hasUserContentType) {
        if (tab.bodyType === "json") headers["Content-Type"] = "application/json";
        else if (tab.bodyType === "xml") headers["Content-Type"] = "application/xml";
        else if (tab.bodyType === "text") headers["Content-Type"] = "text/plain";
      }
    } else if (tab.bodyType === "form-data" || tab.bodyType === "x-www-form-urlencoded") {
      // Build form_data items for backend
      const items: typeof formDataToSend = [];
      for (const f of tab.formData) {
        if (!f.key) continue;
        const item: (typeof items)[0] = {
          key: f.key,
          value: f.value,
          type: f.type || "text",
          enabled: f.enabled,
          file_name: f.fileName || null,
          file_content_base64: null,
        };
        // Read file content to base64 if file type
        if (f.type === "file" && f.file) {
          item.file_content_base64 = await fileToBase64(f.file);
          item.file_name = f.file.name;
        }
        items.push(item);
      }
      formDataToSend = items;
    }

    const { authType, authConfig } = buildAuthConfig(tab);

    // Resolve path parameters in URL
    let resolvedUrl = tab.url;
    if (tab.pathParams) {
      for (const [key, value] of Object.entries(tab.pathParams)) {
        if (value) {
          resolvedUrl = resolvedUrl.split(`{${key}}`).join(value);
        }
      }
    }

    const resolveTemplate = (input: string, vars: Map<string, { value: string }>) => (
      input.replace(/{{\s*([^}]+)\s*}}/g, (match, key) => {
        const k = String(key).trim();
        const v = vars.get(k);
        return v ? v.value : match;
      })
    );

    const displayVars = new Map<string, { value: string }>();
    // Globals -> Collection -> Environment (priority)
    for (const [key, value] of Object.entries(workspaceGlobals)) {
      displayVars.set(key, { value });
    }
    for (const [key, value] of Object.entries(activeCollectionVars)) {
      displayVars.set(key, { value });
    }
    for (const v of activeEnvVariables) {
      displayVars.set(v.key, { value: v.value });
    }
    const secretValues = activeEnvVariables
      .filter((v) => v.is_secret && v.value)
      .map((v) => v.value);

    // Build request settings for backend (snake_case)
    const rs = tab.requestSettings ?? defaultRequestSettings;
    const requestSettings = {
      http_version: rs.httpVersion,
      verify_ssl: rs.verifySsl,
      follow_redirects: rs.followRedirects,
      follow_original_method: rs.followOriginalMethod,
      follow_auth_header: rs.followAuthHeader,
      remove_referer_on_redirect: rs.removeRefererOnRedirect,
      encode_url: rs.encodeUrl,
      max_redirects: rs.maxRedirects,
      disable_cookie_jar: rs.disableCookieJar,
      use_server_cipher_suite: rs.useServerCipherSuite,
      disabled_tls_protocols: rs.disabledTlsProtocols,
    };

    // Check if settings differ from defaults
    const isDefaultSettings = JSON.stringify(requestSettings) === JSON.stringify({
      http_version: "http2", verify_ssl: true, follow_redirects: true,
      follow_original_method: false, follow_auth_header: false,
      remove_referer_on_redirect: false, encode_url: true, max_redirects: 10,
      disable_cookie_jar: false, use_server_cipher_suite: false, disabled_tls_protocols: [],
    });

    const sentRequest: SentRequestSnapshot = {
      method: tab.protocol === "graphql" ? "POST" : tab.method,
      url: resolveTemplate(resolvedUrl, displayVars),
      headers: Object.keys(headers).length > 0
        ? Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, resolveTemplate(v, displayVars)]))
        : {},
      query_params: Object.keys(queryParams).length > 0
        ? Object.fromEntries(Object.entries(queryParams).map(([k, v]) => [k, resolveTemplate(v, displayVars)]))
        : {},
      body: bodyToSend ? resolveTemplate(bodyToSend, displayVars) : bodyToSend,
      body_type: tab.protocol === "graphql" ? "json" : tab.bodyType,
      form_data: formDataToSend?.map(({ file_content_base64, ...rest }) => ({
        ...rest,
        value: resolveTemplate(rest.value, displayVars),
      })),
      auth_type: authType === "oauth2" ? "bearer" : authType,
      auth_config: Object.keys(authConfig).length > 0
        ? Object.fromEntries(Object.entries(authConfig).map(([k, v]) => [k, resolveTemplate(v, displayVars)]))
        : undefined,
      environment_id: tab.envOverrideId ?? selectedEnvId ?? null,
      secret_values: secretValues.length > 0 ? secretValues : undefined,
    };

    updateTab(activeTabId, { sentRequest });

    setLoading(true);
    try {
      const proxyPayload = {
        method: (tab.protocol === "graphql" ? "POST" : tab.method) as import("@/types").HttpMethod,
        url: resolvedUrl,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: bodyToSend,
        body_type: tab.protocol === "graphql" ? "json" : tab.bodyType,
        form_data: formDataToSend,
        query_params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        auth_type: (authType === "oauth2" ? "bearer" : authType) as import("@/types").AuthType,
        auth_config: Object.keys(authConfig).length > 0 ? authConfig : undefined,
        environment_id: tab.envOverrideId ?? selectedEnvId ?? undefined,
        collection_id: tab.collectionId,
        collection_item_id: tab.collectionItemId,
        pre_request_script: tab.preRequestScript?.trim() || undefined,
        post_response_script: tab.postResponseScript?.trim() || undefined,
        script_language: tab.scriptLanguage || "javascript",
        request_settings: isDefaultSettings ? undefined : requestSettings,
      };

      let response: import("@/types").ProxyResponse;

      if (proxyMode === "server") {
        // Server-side proxy (original flow)
        const { data } = await proxyApi.send(proxyPayload);
        response = data;
      } else {
        // Local proxy: prepare → local execute → complete
        const { data: prepared } = await proxyApi.prepare(proxyPayload);
        // Show pre-request results immediately
        if (prepared.pre_request_result) {
          updateTab(activeTabId, { preRequestResult: prepared.pre_request_result });
        }
        // Execute request locally — auto-select channel (desktop > extension)
        const localExecute = localChannel === "desktop" ? executeViaDesktop : executeViaExtension;
        const localResult = await localExecute({
          url: prepared.url,
          method: prepared.method,
          headers: prepared.headers,
          body: prepared.body,
          query_params: prepared.query_params,
        });
        // Complete on server (post-scripts, history, pm.* persist)
        const { data } = await proxyApi.complete({
          ...localResult,
          prepare_token: prepared.prepare_token,
        });
        // Merge pre_request_result from prepare phase
        response = { ...data, pre_request_result: prepared.pre_request_result };
      }

      updateTab(activeTabId, {
        response,
        responseTimestamp: Date.now(),
        preRequestResult: response.pre_request_result ?? null,
        scriptResult: response.script_result ?? null,
      });

      // Reload cached variable scopes if scripts modified them
      const allResults = [response.pre_request_result, response.script_result];
      let needGlobals = false, needEnv = false, needCol = false;
      for (const sr of allResults) {
        if (!sr) continue;
        if (sr.globals_updates && Object.keys(sr.globals_updates).length > 0) needGlobals = true;
        if (sr.environment_updates && Object.keys(sr.environment_updates).length > 0) needEnv = true;
        if (sr.collection_var_updates && Object.keys(sr.collection_var_updates).length > 0) needCol = true;
      }
      if (needGlobals) loadGlobals();
      if (needEnv) loadEnvironments();
      if (needCol) loadCollections();
    } catch (err: unknown) {
      // Extract server error detail from axios response, fall back to generic message
      const axiosDetail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const message = axiosDetail || (err instanceof Error ? err.message : t("request.failed"));
      setSnack({ msg: message, severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [tabs, activeTabId, selectedEnvId, updateTab, buildAuthConfig, fileToBase64, loadGlobals, loadEnvironments, loadCollections, workspaceGlobals, activeCollectionVars, activeEnvVariables, proxyMode, localChannel]);

  // ── Save helpers ──
  const buildTabPayload = useCallback((tab: RequestTab) => {
    const headers: Record<string, string> = {};
    for (const h of tab.headers) {
      if (h.enabled && h.key) headers[h.key] = h.value;
    }
    const queryParams: Record<string, string> = {};
    for (const p of tab.queryParams) {
      if (p.enabled && p.key) queryParams[p.key] = p.value;
    }
    // Build auth_config for persistence
    const authConfig: Record<string, string> = {};
    if (tab.authType === "bearer") {
      authConfig.token = tab.bearerToken;
    } else if (tab.authType === "basic") {
      authConfig.username = tab.basicUsername;
      authConfig.password = tab.basicPassword;
    } else if (tab.authType === "api_key") {
      authConfig.key = tab.apiKeyName;
      authConfig.value = tab.apiKeyValue;
      authConfig.placement = tab.apiKeyPlacement;
    } else if (tab.authType === "oauth2") {
      authConfig.grantType = tab.oauthConfig.grantType;
      authConfig.authUrl = tab.oauthConfig.authUrl;
      authConfig.tokenUrl = tab.oauthConfig.tokenUrl;
      authConfig.clientId = tab.oauthConfig.clientId;
      authConfig.clientSecret = tab.oauthConfig.clientSecret;
      authConfig.redirectUri = tab.oauthConfig.redirectUri;
      authConfig.scope = tab.oauthConfig.scope;
      authConfig.usePkce = String(tab.oauthConfig.usePkce);
      authConfig.accessToken = tab.oauthConfig.accessToken;
    }
    // Build form_data for persistence (strip File objects)
    const formData = (tab.bodyType === "form-data" || tab.bodyType === "x-www-form-urlencoded")
      ? tab.formData
          .filter((f) => f.key)
          .map((f) => ({
            key: f.key,
            value: f.value,
            type: f.type || "text",
            enabled: f.enabled,
            file_name: f.fileName || null,
          }))
      : null;
    // Build request settings for persistence
    const rs = tab.requestSettings ?? defaultRequestSettings;
    const settings = {
      http_version: rs.httpVersion,
      verify_ssl: rs.verifySsl,
      follow_redirects: rs.followRedirects,
      follow_original_method: rs.followOriginalMethod,
      follow_auth_header: rs.followAuthHeader,
      remove_referer_on_redirect: rs.removeRefererOnRedirect,
      encode_url: rs.encodeUrl,
      max_redirects: rs.maxRedirects,
      disable_cookie_jar: rs.disableCookieJar,
      use_server_cipher_suite: rs.useServerCipherSuite,
      disabled_tls_protocols: rs.disabledTlsProtocols,
    };
    // GraphQL-specific settings
    const graphqlSettings = tab.protocol === "graphql" ? {
      graphql_variables: tab.graphqlVariables || "{}",
    } : {};

    return {
      headers, queryParams,
      auth_config: Object.keys(authConfig).length > 0 ? authConfig : null,
      form_data: formData,
      settings: { ...settings, ...graphqlSettings },
      protocol: tab.protocol ?? "http",
    };
  }, []);

  // Quick save: update existing request (no dialog)
  const handleQuickSave = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab?.savedRequestId) return;

    const { headers, queryParams, auth_config, form_data, settings, protocol } = buildTabPayload(tab);
    try {
      await requestsApi.update(tab.savedRequestId, {
        name: tab.name, method: tab.protocol === "graphql" ? "POST" : tab.method, url: tab.url,
        headers, body: tab.protocol === "graphql" ? (tab.graphqlQuery || "") : tab.body,
        body_type: tab.protocol === "graphql" ? "graphql" : tab.bodyType,
        auth_type: tab.authType, auth_config: auth_config as Record<string, string>,
        query_params: queryParams,
        pre_request_script: tab.preRequestScript || null,
        post_response_script: tab.postResponseScript || null,
        form_data: form_data as any,
        settings: settings as any,
        protocol,
      });
      updateTab(activeTabId, { isDirty: false });
      setSnack({ msg: t("request.saved"), severity: "success" });
      loadCollections();
    } catch {
      setSnack({ msg: t("request.saveFailed"), severity: "error" });
    }
  }, [tabs, activeTabId, buildTabPayload, updateTab, loadCollections]);

  // Save as new: create new request + collection item (via dialog)
  const handleSaveRequest = useCallback(async (name: string, collectionId: string, folderId?: string) => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    const { headers, queryParams, auth_config, form_data, settings, protocol } = buildTabPayload(tab);
    try {
      const { data: req } = await requestsApi.create({
        name, method: tab.protocol === "graphql" ? "POST" : tab.method, url: tab.url,
        headers, body: tab.protocol === "graphql" ? (tab.graphqlQuery || "") : tab.body,
        body_type: tab.protocol === "graphql" ? "graphql" : tab.bodyType,
        auth_type: tab.authType, auth_config: auth_config as Record<string, string>,
        query_params: queryParams,
        pre_request_script: tab.preRequestScript || null,
        post_response_script: tab.postResponseScript || null,
        form_data: form_data as any,
        settings: settings as any,
        protocol,
      });
      await collectionsApi.createItem(collectionId, { name, request_id: req.id, parent_id: folderId || undefined });
      updateTab(activeTabId, { name, savedRequestId: req.id, collectionId, isDirty: false });
      setSnack({ msg: t("request.saved"), severity: "success" });
      loadCollections();
    } catch {
      setSnack({ msg: t("request.saveFailed"), severity: "error" });
    }
  }, [tabs, activeTabId, buildTabPayload, updateTab, loadCollections]);

  // ── Load request from collection ──
  const handleSelectRequest = useCallback(async (requestId: string, collectionId?: string, collectionItemId?: string) => {
    const existingTab = tabs.find((t) => t.savedRequestId === requestId);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      setView("request");
      return;
    }

    try {
      const { data: req } = await requestsApi.get(requestId);
      const protocol = (req.protocol ?? "http") as Protocol;
      const tab = createNewTab(protocol);
      tab.name = req.name;
      tab.method = req.method;
      tab.url = req.url;
      tab.savedRequestId = req.id;
      tab.collectionId = collectionId;
      tab.collectionItemId = collectionItemId;
      tab.isDirty = false;
      if (req.headers) {
        tab.headers = Object.entries(req.headers).map(([key, value]) => ({
          ...newPair(), key, value,
        }));
        tab.headers.push(newPair());
      }
      if (req.query_params) {
        tab.queryParams = Object.entries(req.query_params).map(([key, value]) => ({
          ...newPair(), key, value,
        }));
        tab.queryParams.push(newPair());
      }
      if (req.body) tab.body = req.body;
      if (req.body_type) tab.bodyType = req.body_type as BodyType;
      if (req.auth_type) tab.authType = req.auth_type as AuthType;
      if (req.pre_request_script) tab.preRequestScript = req.pre_request_script;
      if (req.post_response_script) tab.postResponseScript = req.post_response_script;

      // Restore auth_config
      if (req.auth_config) {
        const ac = req.auth_config;
        if (tab.authType === "bearer") {
          tab.bearerToken = ac.token || "";
        } else if (tab.authType === "basic") {
          tab.basicUsername = ac.username || "";
          tab.basicPassword = ac.password || "";
        } else if (tab.authType === "api_key") {
          tab.apiKeyName = ac.key || "X-API-Key";
          tab.apiKeyValue = ac.value || "";
          tab.apiKeyPlacement = (ac.placement as "header" | "query") || "header";
        } else if (tab.authType === "oauth2") {
          tab.oauthConfig = {
            grantType: (ac.grantType as "authorization_code" | "client_credentials") || "authorization_code",
            authUrl: ac.authUrl || "",
            tokenUrl: ac.tokenUrl || "",
            clientId: ac.clientId || "",
            clientSecret: ac.clientSecret || "",
            redirectUri: ac.redirectUri || "http://localhost:5173/oauth/callback",
            scope: ac.scope || "",
            usePkce: ac.usePkce === "true",
            accessToken: ac.accessToken || "",
          };
        }
      }

      // Restore form_data
      if (req.form_data && req.form_data.length > 0) {
        tab.formData = req.form_data.map((fd) => ({
          ...newPair(),
          key: fd.key,
          value: fd.value,
          type: fd.type as "text" | "file",
          enabled: fd.enabled,
          fileName: fd.file_name || "",
        }));
        tab.formData.push(newPair());
      }

      // Restore request settings (backend stores snake_case)
      if (req.settings) {
        const s = req.settings as any;
        tab.requestSettings = {
          httpVersion: s.http_version ?? s.httpVersion ?? "http2",
          verifySsl: s.verify_ssl ?? s.verifySsl ?? true,
          followRedirects: s.follow_redirects ?? s.followRedirects ?? true,
          followOriginalMethod: s.follow_original_method ?? s.followOriginalMethod ?? false,
          followAuthHeader: s.follow_auth_header ?? s.followAuthHeader ?? false,
          removeRefererOnRedirect: s.remove_referer_on_redirect ?? s.removeRefererOnRedirect ?? false,
          encodeUrl: s.encode_url ?? s.encodeUrl ?? true,
          maxRedirects: s.max_redirects ?? s.maxRedirects ?? 10,
          disableCookieJar: s.disable_cookie_jar ?? s.disableCookieJar ?? false,
          useServerCipherSuite: s.use_server_cipher_suite ?? s.useServerCipherSuite ?? false,
          disabledTlsProtocols: s.disabled_tls_protocols ?? s.disabledTlsProtocols ?? [],
        };
        // Restore GraphQL variables from settings
        if (protocol === "graphql") {
          tab.graphqlVariables = s.graphql_variables || "{}";
        }
      }

      // Restore GraphQL query from body
      if (protocol === "graphql" && req.body) {
        tab.graphqlQuery = req.body;
      }

      setTabs((prev) => [...prev, tab]);
      setActiveTabId(tab.id);
      setView("request");
    } catch {
      setSnack({ msg: t("request.loadFailed"), severity: "error" });
    }
  }, [tabs]);

  // ── Collection operations ──
  const handleCreateCollection = useCallback(async (name: string, desc: string, visibility: "private" | "shared") => {
    await collectionsApi.create({ name, description: desc, visibility, workspace_id: currentWorkspaceId ?? undefined });
    loadCollections();
    setSnack({ msg: t("collection.created"), severity: "success" });
  }, [currentWorkspaceId, loadCollections]);

  const handleCreateFolder = useCallback(async (name: string) => {
    if (!showCreateFolder) return;
    await collectionsApi.createItem(showCreateFolder.collectionId, {
      name,
      is_folder: true,
      parent_id: showCreateFolder.parentId || undefined,
    });
    loadCollections();
    loadCollectionTree(showCreateFolder.collectionId);
  }, [showCreateFolder, loadCollections, loadCollectionTree]);

  const handleRename = useCallback(async (name: string) => {
    if (!showRename) return;
    if (showRename.type === "collection") {
      await collectionsApi.update(showRename.id, { name });
      setTabs((prev) => prev.map((t) =>
        t.tabType === "collection" && t.collectionId === showRename.id
          ? { ...t, name }
          : t
      ));
    } else {
      await collectionsApi.updateItem(showRename.id, { name });
      // Deep search for the item (may be nested in folders)
      let requestId: string | null = null;
      for (const items of Object.values(collectionItems)) {
        const flat = items.flatMap(function flatten(it: CollectionItem): CollectionItem[] {
          return [it, ...(it.children ?? []).flatMap(flatten)];
        });
        const found = flat.find((i) => i.id === showRename.id);
        if (found?.request_id) { requestId = found.request_id; break; }
      }
      if (requestId) {
        // Also update the request entity name
        await requestsApi.update(requestId, { name });
        setTabs((prev) => prev.map((t) =>
          t.savedRequestId === requestId ? { ...t, name } : t
        ));
      }
    }
    loadCollections();
  }, [showRename, loadCollections, collectionItems]);

  const handleEditCollection = useCallback(async (name: string, description: string, visibility: "private" | "shared", variables: Record<string, string>) => {
    if (!showEditCol) return;
    await collectionsApi.update(showEditCol.id, { name, description, visibility, variables });
    loadCollections();
    setShowEditCol(null);
  }, [showEditCol, loadCollections]);

  const handleDelete = useCallback(async () => {
    if (!showDelete) return;
    const deletedId = showDelete.id;
    if (showDelete.type === "collection") {
      await collectionsApi.delete(deletedId);
      // Close tabs belonging to this collection
      setTabs((prev) => {
        const next = prev.filter((t) =>
          !(t.tabType === "collection" && t.collectionId === deletedId) &&
          !(t.parentCollectionId === deletedId),
        );
        if (next.length === 0) setActiveTabId("");
        else if (!next.find((t) => t.id === activeTabId)) setActiveTabId(next[next.length - 1]!.id);
        return next;
      });
    } else {
      await collectionsApi.deleteItem(deletedId);
      // Close tabs for this specific item (folder or request)
      setTabs((prev) => {
        const next = prev.filter((t) => {
          if (t.tabType === "folder" && t.collectionId === deletedId) return false;
          // Check if the tab's collectionItemId matches the deleted item
          if (t.collectionItemId === deletedId) return false;
          return true;
        });
        if (next.length === 0) setActiveTabId("");
        else if (!next.find((t) => t.id === activeTabId)) setActiveTabId(next[next.length - 1]!.id);
        return next;
      });
    }
    loadCollections();
  }, [showDelete, loadCollections, activeTabId]);

  const handleDuplicateCollection = useCallback(async (newName: string) => {
    if (!showDuplicateCol) return;
    try {
      await collectionsApi.duplicate(showDuplicateCol.id, newName);
      loadCollections();
      setSnack({ msg: t("collection.duplicated"), severity: "success" });
    } catch {
      setSnack({ msg: t("common.error"), severity: "error" });
    }
  }, [showDuplicateCol, loadCollections, t]);

  const ensureHasCollection = useCallback(() => {
    if (collections.length > 0) return true;
    setSnack({ msg: t("dashboard.noCollections"), severity: "error" });
    setShowCreateCol(true);
    return false;
  }, [collections.length, t]);

  const handleNewRequest = useCallback((collectionId: string, folderId?: string) => {
    setSaveTarget({ collectionId, folderId });
    handleNewTab();
  }, [handleNewTab]);

  const handleMoveItem = useCallback(async (collectionId: string, itemId: string, parentId: string | null) => {
    const items = collectionItems[collectionId] ?? [];
    const current = items.find((i) => i.id === itemId);
    const currentParent = current?.parent_id ?? null;
    if (currentParent === parentId) return;

    const siblings = items.filter((i) => (i.parent_id ?? null) === parentId && i.id !== itemId);
    const maxSort = siblings.reduce((max, item) => Math.max(max, item.sort_order ?? 0), 0);
    const nextSort = maxSort + 1;

    try {
      await collectionsApi.updateItem(itemId, { parent_id: parentId ?? undefined, sort_order: nextSort });
      await loadCollectionTree(collectionId);
    } catch {
      setSnack({ msg: t("common.error"), severity: "error" });
    }
  }, [collectionItems, loadCollectionTree, t]);

  const handleRunCollection = useCallback((collectionId: string) => {
    const col = collections.find((c) => c.id === collectionId);
    setShowRunner({ id: collectionId, name: col?.name ?? "Collection" });
  }, [collections]);

  const handleGenerateDocs = useCallback(
    (collectionId: string, collectionName: string, folderId?: string, folderName?: string) => {
      const col = collections.find((c) => c.id === collectionId);
      setShowDocGen({
        collectionId,
        collectionName: col?.name ?? (collectionName || "Collection"),
        folderId,
        folderName,
      });
    },
    [collections],
  );

  const handleShareDocs = useCallback(
    (collectionId: string, collectionName: string, folderId?: string | null, folderName?: string | null) => {
      const col = collections.find((c) => c.id === collectionId);
      setShowShareDocs({
        collectionId,
        collectionName: col?.name ?? (collectionName || "Collection"),
        folderId,
        folderName,
      });
    },
    [collections],
  );

  // ── Environment operations ──
  const handleCreateEnv = useCallback(async (name: string, envType: string, variables: { key: string; value: string; is_secret: boolean }[]) => {
    if (!currentWorkspaceId) {
      setSnack({ msg: t("workspace.createFirst"), severity: "error" });
      return;
    }
    const { data: created } = await environmentsApi.create({ name, env_type: envType, workspace_id: currentWorkspaceId, variables });
    setEnvironments((prev) => {
      if (prev.some((e) => e.id === created.id)) return prev;
      return [...prev, created];
    });
    loadEnvironments();
  }, [currentWorkspaceId, loadEnvironments]);

  const handleUpdateEnv = useCallback(async (id: string, name: string, envType: string) => {
    await environmentsApi.update(id, { name, env_type: envType });
    loadEnvironments();
  }, [loadEnvironments]);

  const handleDeleteEnv = useCallback(async (id: string) => {
    await environmentsApi.delete(id);
    if (selectedEnvId === id) setSelectedEnvId(null);
    loadEnvironments();
  }, [selectedEnvId, loadEnvironments]);

  const handleSetVariables = useCallback(async (id: string, variables: { key: string; value: string; is_secret: boolean }[]) => {
    await environmentsApi.setVariables(id, variables);

    // Sync missing keys to other environments in the same workspace
    // Fetch fresh data from server to avoid stale closure issues
    const savedKeys = variables.map((v) => v.key).filter(Boolean);
    if (savedKeys.length > 0 && currentWorkspaceId) {
      try {
        const { data: freshEnvs } = await environmentsApi.list(currentWorkspaceId);
        const otherEnvs = freshEnvs.filter((e) => e.id !== id);
        for (const env of otherEnvs) {
          const existingKeys = new Set(env.variables.map((v) => v.key));
          const missingKeys = savedKeys.filter((k) => !existingKeys.has(k));
          if (missingKeys.length > 0) {
            const updatedVars = [
              ...env.variables.map((v) => ({ key: v.key, value: v.value, is_secret: v.is_secret })),
              ...missingKeys.map((k) => ({ key: k, value: "", is_secret: false })),
            ];
            await environmentsApi.setVariables(env.id, updatedVars);
          }
        }
      } catch { /* ignore sync errors */ }
    }

    loadEnvironments();
    setSnack({ msg: t("environment.variablesSaved"), severity: "success" });
  }, [currentWorkspaceId, loadEnvironments]);

  // ── Workspace operations ──
  const handleSelectEnvironment = useCallback((id: string | null) => {
    setSelectedEnvId(id);
    if (id) {
      localStorage.setItem("openreq-env", id);
    } else {
      localStorage.removeItem("openreq-env");
    }
  }, []);

  const handleSelectWorkspace = useCallback((id: string) => {
    setCurrentWorkspaceId(id);
    localStorage.setItem("openreq-workspace", id);
    // Close all saved/collection/folder/testflow tabs — they belong to the old workspace
    setTabs((prev) => {
      const next = prev.filter((t) =>
        !t.savedRequestId && !t.collectionId && t.tabType !== "collection" && t.tabType !== "folder" && t.tabType !== "testflow",
      );
      if (next.length === 0) setActiveTabId("");
      else if (!next.find((t) => t.id === activeTabId)) setActiveTabId(next[next.length - 1]?.id ?? "");
      return next;
    });
  }, [activeTabId]);

  // ── History ──
  const handleLoadFromHistory = useCallback((method: string, url: string) => {
    const tab = createNewTab();
    tab.method = method as HttpMethod;
    tab.url = url;
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setShowHistory(false);
    setView("request");
  }, []);

  // ── Open collection detail tab ──
  const handleOpenCollection = useCallback((collectionId: string) => {
    // Check if already open
    const existing = tabs.find((t) => t.tabType === "collection" && t.collectionId === collectionId);
    if (existing) {
      setActiveTabId(existing.id);
      setView("request");
      return;
    }
    const col = collections.find((c) => c.id === collectionId);
    if (!col) return;
    // Ensure the tree is loaded
    if (!collectionTrees[collectionId]) {
      loadCollectionTree(collectionId);
    }
    const tab = createCollectionTab(collectionId, col.name);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setView("request");
  }, [tabs, collections, collectionTrees, loadCollectionTree]);

  // ── Open test flow tab ──
  const handleOpenTestFlow = useCallback((flowId: string, flowName: string) => {
    const existing = tabs.find((t) => t.tabType === "testflow" && t.collectionId === flowId);
    if (existing) {
      setActiveTabId(existing.id);
      setView("request");
      return;
    }
    const tab = createTestFlowTab(flowId, flowName);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setView("request");
    setShowTestFlowList(false);
  }, [tabs]);

  // ── Open folder detail tab ──
  const handleOpenFolder = useCallback((folderId: string, collectionId: string) => {
    const existing = tabs.find((t) => t.tabType === "folder" && t.collectionId === folderId);
    if (existing) {
      setActiveTabId(existing.id);
      setView("request");
      return;
    }
    // Find folder name from loaded items
    const items = collectionItems[collectionId] ?? [];
    const findFolder = (list: CollectionItem[]): CollectionItem | null => {
      for (const item of list) {
        if (item.id === folderId) return item;
        if (item.children) {
          const found = findFolder(item.children);
          if (found) return found;
        }
      }
      return null;
    };
    const folder = findFolder(items);
    const tab = createFolderTab(folderId, folder?.name || "Folder", collectionId);
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
    setView("request");
  }, [tabs, collectionItems]);

  // ── Save folder from detail view ──
  const handleSaveFolder = useCallback(async (folderId: string, parentCollectionId: string, data: Record<string, unknown>) => {
    try {
      await collectionsApi.updateItem(folderId, data as Parameters<typeof collectionsApi.updateItem>[1]);
      // Update tab name
      const newName = data.name as string;
      if (newName) {
        setTabs((prev) =>
          prev.map((t) =>
            t.tabType === "folder" && t.collectionId === folderId
              ? { ...t, name: newName, isDirty: false }
              : t
          )
        );
      }
      loadCollections();
      loadCollectionTree(parentCollectionId);
      setSnack({ msg: t("folder.saved"), severity: "success" });
    } catch {
      setSnack({ msg: t("folder.saveFailed"), severity: "error" });
    }
  }, [loadCollections, loadCollectionTree, t]);

  // ── Save collection from detail view ──
  const handleSaveCollectionDetail = useCallback(async (collectionId: string, data: { name: string; description: string; visibility: "private" | "shared"; variables: Record<string, string>; auth_type?: string | null; auth_config?: Record<string, string> | null; pre_request_script?: string | null; post_response_script?: string | null; script_language?: string | null }) => {
    try {
      await collectionsApi.update(collectionId, data);
      await loadCollections();
      // Update tab name if it changed
      setTabs((prev) => prev.map((t) =>
        t.tabType === "collection" && t.collectionId === collectionId
          ? { ...t, name: data.name, isDirty: false }
          : t
      ));
      setSnack({ msg: t("collectionDetail.saved"), severity: "success" });
    } catch {
      setSnack({ msg: t("collectionDetail.saveFailed"), severity: "error" });
    }
  }, [loadCollections, t]);

  return (
    <ProxyModeContext.Provider value={proxyModeValue}>
    <TopBar
      mode={mode}
      onToggleTheme={onToggleTheme}
      onLogout={onLogout}
      username={user.username}
      workspaces={workspaces}
      currentWorkspaceId={currentWorkspaceId}
      onSelectWorkspace={handleSelectWorkspace}
      environments={environments}
      selectedEnvironmentId={selectedEnvId}
      onSelectEnvironment={handleSelectEnvironment}
      showCollectionsSidebar={showCollectionsSidebar}
      onToggleCollections={() => {
        setShowCollectionsSidebar((prev) => {
          const next = !prev;
          localStorage.setItem("openreq-collections-sidebar", String(next));
          return next;
        });
      }}
      onOpenHistory={() => setShowHistory(true)}
      onOpenTestBuilder={() => setShowTestFlowList(true)}
      onOpenImport={() => setShowImport(true)}
      onOpenSDK={() => setShowSDK(true)}
      onOpenAIAgent={() => setShowAIAgent(true)}
      onOpenSettings={() => setView("settings")}
      activeNavItem={view === "settings" ? "settings" : showAIAgent ? "aiAgent" : null}
    />
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>

      {showCollectionsSidebar && <Sidebar
        collections={collections}
        collectionItems={collectionItems}
        collectionTrees={collectionTrees}
        collectionTreeLoading={collectionTreeLoading}
        onSelectRequest={handleSelectRequest}
        onOpenCollection={handleOpenCollection}
        onNewCollection={() => setShowCreateCol(true)}
        onNewFolder={(colId, parentId) => setShowCreateFolder({ collectionId: colId, parentId: parentId || null })}
        onNewRequest={handleNewRequest}
        onEditCollection={(id, name, description, visibility, variables) => setShowEditCol({ id, name, description, visibility, variables })}
        onRenameCollection={(id, name) => setShowRename({ id, name, type: "collection" })}
        onDeleteCollection={(id, name) => setShowDelete({ id, name, type: "collection" })}
        onDuplicateCollection={(id, name) => setShowDuplicateCol({ id, name })}
        onRenameItem={(id, name) => setShowRename({ id, name, type: "item" })}
        onDeleteItem={(id, name) => setShowDelete({ id, name, type: "item" })}
        onRunCollection={handleRunCollection}
        onGenerateDocs={handleGenerateDocs}
        onShareDocs={handleShareDocs}
        onOpenAIWizard={() => setShowAIWizard(true)}
        onOpenImport={() => setShowImport(true)}
        onExportCollection={async (colId) => {
          try {
            const { data } = await importExportApi.exportPostman(colId);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${data.info?.name || "collection"}.postman_collection.json`;
            a.click();
            URL.revokeObjectURL(url);
            setSnack({ msg: t("collection.exportSuccess"), severity: "success" });
          } catch {
            setSnack({ msg: t("common.error"), severity: "error" });
          }
        }}
        onExportFolder={async (folderId, name) => {
          try {
            const { data } = await importExportApi.exportPostmanFolder(folderId);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${name || data.info?.name || "folder"}.postman_collection.json`;
            a.click();
            URL.revokeObjectURL(url);
            setSnack({ msg: t("collection.exportSuccess"), severity: "success" });
          } catch {
            setSnack({ msg: t("common.error"), severity: "error" });
          }
        }}
        onExportRequest={async (requestId, name) => {
          try {
            const { data } = await importExportApi.exportPostmanRequest(requestId);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${name || data.info?.name || "request"}.postman_collection.json`;
            a.click();
            URL.revokeObjectURL(url);
            setSnack({ msg: t("collection.exportSuccess"), severity: "success" });
          } catch {
            setSnack({ msg: t("common.error"), severity: "error" });
          }
        }}
        onCloneItem={handleCloneItem}
        onRequestCollectionTree={loadCollectionTree}
        onRequestAllCollectionItems={loadAllCollectionItems}
        onMoveItem={handleMoveItem}
        onOpenFolder={handleOpenFolder}
        onRefreshCollections={loadCollections}
      />}

      <Box sx={{
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "margin-right 225ms cubic-bezier(0, 0, 0.2, 1)",
        marginRight: showAIAgent ? `${DRAWER_WIDTH}px` : 0,
      }}>
        <Toolbar sx={{ minHeight: "40px !important" }} />

        {view === "request" && (
          <>
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={(id) => { setActiveTabId(id); setView("request"); }}
              onCloseTab={handleCloseTab}
              onNewTab={handleNewTab}
              onDuplicateTab={handleDuplicateTab}
              onCloseOtherTabs={handleCloseOtherTabs}
              onCloseAllTabs={handleCloseAllTabs}
              onRenameTab={handleRenameTab}
              onCloneRequest={handleCloneRequest}
            />

            {/* Request name bar — shown for request tabs (http/ws/gql) */}
            {activeTab && activeTab.tabType !== "collection" && activeTab.tabType !== "testflow" && activeTab.tabType !== "folder" && activeTab.name && (
              <Box sx={{
                px: 2, py: 0.5,
                display: "flex", alignItems: "center", gap: 1,
                borderBottom: "1px solid", borderColor: "divider",
                bgcolor: "background.default",
                minHeight: 28,
              }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    fontSize: "0.82rem",
                    color: "text.primary",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {activeTab.name}
                </Typography>
                {activeTab.savedRequestId && (
                  <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.7rem" }}>
                    {activeTab.protocol === "websocket" ? "WebSocket" : activeTab.protocol === "graphql" ? "GraphQL" : activeTab.method}
                  </Typography>
                )}
              </Box>
            )}

            {/* Dashboard: when no tabs are open */}
            {tabs.length === 0 && (
              <Dashboard
                collections={collections}
                collectionItems={collectionItems}
                onNewRequest={() => { if (ensureHasCollection()) handleNewTab(); }}
                onNewCollection={() => setShowCreateCol(true)}
                onOpenImport={() => setShowImport(true)}
                onOpenAIWizard={() => setShowAIWizard(true)}
                onOpenHistory={() => setShowHistory(true)}
                onNewWebSocket={() => { if (ensureHasCollection()) handleNewTab("websocket"); }}
                onNewGraphQL={() => { if (ensureHasCollection()) handleNewTab("graphql"); }}
                onOpenCollection={handleOpenCollection}
              />
            )}

            {/* Collection Detail tab */}
            {activeTab && activeTab.tabType === "collection" && activeTab.collectionId && (() => {
              const col = collections.find((c) => c.id === activeTab.collectionId);
              if (!col) return null;
              return (
                <CollectionDetail
                  key={activeTab.collectionId}
                  collection={col}
                  collectionTree={collectionTrees[activeTab.collectionId] ?? []}
                  onSave={(data) => handleSaveCollectionDetail(activeTab.collectionId!, data)}
                  onDirtyChange={(dirty) => {
                    setTabs((prev) => {
                      const tab = prev.find((t) => t.id === activeTab.id);
                      if (!tab || tab.isDirty === dirty) return prev;
                      return prev.map((t) => t.id === activeTab.id ? { ...t, isDirty: dirty } : t);
                    });
                  }}
                  onRunCollection={handleRunCollection}
                  resolvedVariables={scriptVarResolved}
                  variableGroups={scriptVarGroups}
                />
              );
            })()}

            {/* Test Flow Canvas tab */}
            {activeTab && activeTab.tabType === "testflow" && activeTab.collectionId && (
              <ReactFlowProvider>
                <TestFlowCanvas
                  key={activeTab.collectionId}
                  flowId={activeTab.collectionId}
                  environments={environments}
                  selectedEnvId={selectedEnvId}
                  collections={collections}
                  collectionItems={collectionItems}
                  onLoadAllItems={loadAllCollectionItems}
                  onOpenRequest={handleSelectRequest}
                  onVariablesChanged={() => { loadGlobals(); loadEnvironments(); loadCollections(); }}
                />
              </ReactFlowProvider>
            )}

            {/* Folder Detail tab */}
            {activeTab && activeTab.tabType === "folder" && activeTab.collectionId && (() => {
              const parentColId = activeTab.parentCollectionId;
              // Find folder from loaded items
              const items = parentColId ? (collectionItems[parentColId] ?? []) : [];
              const findFolder = (list: CollectionItem[]): CollectionItem | null => {
                for (const item of list) {
                  if (item.id === activeTab.collectionId) return item;
                  if (item.children) {
                    const found = findFolder(item.children);
                    if (found) return found;
                  }
                }
                return null;
              };
              const folder = findFolder(items);
              if (!folder) return null;
              return (
                <FolderDetail
                  key={activeTab.collectionId}
                  folder={folder}
                  collectionId={parentColId}
                  onSave={(data) => handleSaveFolder(activeTab.collectionId!, parentColId!, data)}
                  onShareDocs={handleShareDocs}
                  onDirtyChange={(dirty) => {
                    setTabs((prev) => {
                      const tab = prev.find((t) => t.id === activeTab.id);
                      if (!tab || tab.isDirty === dirty) return prev;
                      return prev.map((t) => t.id === activeTab.id ? { ...t, isDirty: dirty } : t);
                    });
                  }}
                  resolvedVariables={scriptVarResolved}
                  variableGroups={scriptVarGroups}
                />
              );
            })()}

            {/* WebSocket Builder */}
            {activeTab && activeTab.tabType !== "collection" && activeTab.tabType !== "testflow" && activeTab.tabType !== "folder" && activeTab.protocol === "websocket" && (
              <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                <WebSocketBuilder
                  url={activeTab.url}
                  headers={activeTab.headers}
                  authType={activeTab.authType}
                  bearerToken={activeTab.bearerToken}
                  basicUsername={activeTab.basicUsername}
                  basicPassword={activeTab.basicPassword}
                  apiKeyName={activeTab.apiKeyName}
                  apiKeyValue={activeTab.apiKeyValue}
                  apiKeyPlacement={activeTab.apiKeyPlacement}
                  oauthConfig={activeTab.oauthConfig}
                  wsMessages={activeTab.wsMessages ?? []}
                  wsConnected={activeTab.wsConnected ?? false}
                  onUrlChange={(u) => updateTab(activeTabId, { url: u })}
                  onHeadersChange={(h) => updateTab(activeTabId, { headers: h })}
                  onAuthTypeChange={(a) => updateTab(activeTabId, { authType: a })}
                  onBearerTokenChange={(v) => updateTab(activeTabId, { bearerToken: v })}
                  onBasicUsernameChange={(v) => updateTab(activeTabId, { basicUsername: v })}
                  onBasicPasswordChange={(v) => updateTab(activeTabId, { basicPassword: v })}
                  onApiKeyNameChange={(v) => updateTab(activeTabId, { apiKeyName: v })}
                  onApiKeyValueChange={(v) => updateTab(activeTabId, { apiKeyValue: v })}
                  onApiKeyPlacementChange={(v) => updateTab(activeTabId, { apiKeyPlacement: v })}
                  onOAuthConfigChange={(config) => updateTab(activeTabId, { oauthConfig: config })}
                  onWsMessagesChange={(msgs) => updateTab(activeTabId, { wsMessages: msgs })}
                  onWsConnectedChange={(connected) => updateTab(activeTabId, { wsConnected: connected })}
                  onSave={() => activeTab.savedRequestId ? handleQuickSave() : (ensureHasCollection() && setShowSaveRequest(true))}
                  environments={environments}
                  selectedEnvId={selectedEnvId}
                  envOverrideId={activeTab.envOverrideId}
                  collectionVariables={activeCollectionVars}
                  workspaceGlobals={workspaceGlobals}
                />
              </Box>
            )}

            {/* GraphQL Builder */}
            {activeTab && activeTab.tabType !== "collection" && activeTab.tabType !== "testflow" && activeTab.tabType !== "folder" && activeTab.protocol === "graphql" && (
              <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                <GraphQLBuilder
                  url={activeTab.url}
                  graphqlQuery={activeTab.graphqlQuery ?? ""}
                  graphqlVariables={activeTab.graphqlVariables ?? "{}"}
                  headers={activeTab.headers}
                  authType={activeTab.authType}
                  bearerToken={activeTab.bearerToken}
                  basicUsername={activeTab.basicUsername}
                  basicPassword={activeTab.basicPassword}
                  apiKeyName={activeTab.apiKeyName}
                  apiKeyValue={activeTab.apiKeyValue}
                  apiKeyPlacement={activeTab.apiKeyPlacement}
                  oauthConfig={activeTab.oauthConfig}
                  loading={loading}
                  response={activeTab.response}
                  onUrlChange={(u) => updateTab(activeTabId, { url: u })}
                  onGraphqlQueryChange={(q) => updateTab(activeTabId, { graphqlQuery: q })}
                  onGraphqlVariablesChange={(v) => updateTab(activeTabId, { graphqlVariables: v })}
                  onHeadersChange={(h) => updateTab(activeTabId, { headers: h })}
                  onAuthTypeChange={(a) => updateTab(activeTabId, { authType: a })}
                  onBearerTokenChange={(v) => updateTab(activeTabId, { bearerToken: v })}
                  onBasicUsernameChange={(v) => updateTab(activeTabId, { basicUsername: v })}
                  onBasicPasswordChange={(v) => updateTab(activeTabId, { basicPassword: v })}
                  onApiKeyNameChange={(v) => updateTab(activeTabId, { apiKeyName: v })}
                  onApiKeyValueChange={(v) => updateTab(activeTabId, { apiKeyValue: v })}
                  onApiKeyPlacementChange={(v) => updateTab(activeTabId, { apiKeyPlacement: v })}
                  onOAuthConfigChange={(config) => updateTab(activeTabId, { oauthConfig: config })}
                  onSend={handleSend}
                  onSave={() => activeTab.savedRequestId ? handleQuickSave() : (ensureHasCollection() && setShowSaveRequest(true))}
                  environments={environments}
                  selectedEnvId={selectedEnvId}
                  envOverrideId={activeTab.envOverrideId}
                  collectionVariables={activeCollectionVars}
                  workspaceGlobals={workspaceGlobals}
                  sentRequest={activeTab.sentRequest ?? null}
                  scriptResult={activeTab.scriptResult}
                  preRequestResult={activeTab.preRequestResult}
                  preRequestScript={activeTab.preRequestScript}
                  postResponseScript={activeTab.postResponseScript}
                  scriptLanguage={activeTab.scriptLanguage}
                  onPreRequestScriptChange={(s) => updateTab(activeTabId, { preRequestScript: s })}
                  onPostResponseScriptChange={(s) => updateTab(activeTabId, { postResponseScript: s })}
                  onScriptLanguageChange={(lang) => updateTab(activeTabId, { scriptLanguage: lang })}
                />
              </Box>
            )}

            {/* HTTP Request Builder: normal request tab */}
            {activeTab && activeTab.tabType !== "collection" && activeTab.tabType !== "testflow" && activeTab.tabType !== "folder" && (activeTab.protocol ?? "http") === "http" && (
              <PanelGridLayout>
                {{
                  requestBuilder: (
                    <RequestBuilder
                      method={activeTab.method}
                      url={activeTab.url}
                      pathParams={activeTab.pathParams}
                      headers={activeTab.headers}
                      queryParams={activeTab.queryParams}
                      body={activeTab.body}
                      bodyType={activeTab.bodyType}
                      formData={activeTab.formData}
                      authType={activeTab.authType}
                      bearerToken={activeTab.bearerToken}
                      basicUsername={activeTab.basicUsername}
                      basicPassword={activeTab.basicPassword}
                      apiKeyName={activeTab.apiKeyName}
                      apiKeyValue={activeTab.apiKeyValue}
                      apiKeyPlacement={activeTab.apiKeyPlacement}
                      oauthConfig={activeTab.oauthConfig}
                      loading={loading}
                      environments={environments}
                      selectedEnvId={selectedEnvId}
                      envOverrideId={activeTab.envOverrideId}
                      collectionVariables={activeCollectionVars}
                      workspaceGlobals={workspaceGlobals}
                      onMethodChange={(m) => updateTab(activeTabId, { method: m })}
                      onUrlChange={(u) => updateTab(activeTabId, { url: u })}
                      onPathParamsChange={(p) => updateTab(activeTabId, { pathParams: p })}
                      onHeadersChange={(h) => updateTab(activeTabId, { headers: h })}
                      onQueryParamsChange={(p) => updateTab(activeTabId, { queryParams: p })}
                      onBodyChange={(b) => updateTab(activeTabId, { body: b })}
                      onBodyTypeChange={(t) => updateTab(activeTabId, { bodyType: t })}
                      onFormDataChange={(f) => updateTab(activeTabId, { formData: f })}
                      onAuthTypeChange={(a) => updateTab(activeTabId, { authType: a })}
                      onBearerTokenChange={(v) => updateTab(activeTabId, { bearerToken: v })}
                      onBasicUsernameChange={(v) => updateTab(activeTabId, { basicUsername: v })}
                      onBasicPasswordChange={(v) => updateTab(activeTabId, { basicPassword: v })}
                      onApiKeyNameChange={(v) => updateTab(activeTabId, { apiKeyName: v })}
                      onApiKeyValueChange={(v) => updateTab(activeTabId, { apiKeyValue: v })}
                      onApiKeyPlacementChange={(v) => updateTab(activeTabId, { apiKeyPlacement: v })}
                      onOAuthConfigChange={(config) => updateTab(activeTabId, { oauthConfig: config })}
                      onEnvOverrideChange={(id) => updateTab(activeTabId, { envOverrideId: id })}
                      requestSettings={activeTab.requestSettings ?? defaultRequestSettings}
                      onRequestSettingsChange={(s) => updateTab(activeTabId, { requestSettings: s })}
                      onSend={handleSend}
                      onSave={() => activeTab.savedRequestId ? handleQuickSave() : (ensureHasCollection() && setShowSaveRequest(true))}
                    />
                  ),
                  scriptEditor: (
                    <ScriptEditor
                      preRequestScript={activeTab.preRequestScript}
                      postResponseScript={activeTab.postResponseScript}
                      scriptResult={activeTab.scriptResult}
                      preRequestResult={activeTab.preRequestResult}
                      onPreRequestScriptChange={(s) => updateTab(activeTabId, { preRequestScript: s })}
                      onPostResponseScriptChange={(s) => updateTab(activeTabId, { postResponseScript: s })}
                      scriptLanguage={activeTab.scriptLanguage || "javascript"}
                      onScriptLanguageChange={(lang) => updateTab(activeTabId, { scriptLanguage: lang })}
                      variableGroups={scriptVarGroups}
                      resolvedVariables={scriptVarResolved}
                    />
                  ),
                  responsePanel: (
                    <ResponsePanel
                      response={activeTab.response}
                      sentRequest={activeTab.sentRequest ?? null}
                      responseTimestamp={activeTab.responseTimestamp ?? null}
                      onClearResponse={() => updateTab(activeTabId, { response: null, responseTimestamp: null, scriptResult: null, preRequestResult: null, sentRequest: null })}
                    />
                  ),
                }}
              </PanelGridLayout>
            )}
          </>
        )}

        {view === "settings" && (
          <Box sx={{ overflow: "auto", flexGrow: 1 }}>
            <SettingsPage mode={mode} onToggleTheme={onToggleTheme} user={user} onClose={() => setView("request")} />
          </Box>
        )}

      </Box>

      {/* ── Dialogs ── */}
      <CreateCollectionDialog
        open={showCreateCol}
        onClose={() => setShowCreateCol(false)}
        onCreate={handleCreateCollection}
      />

      <EditCollectionDialog
        open={!!showEditCol}
        collection={showEditCol}
        onClose={() => setShowEditCol(null)}
        onUpdate={handleEditCollection}
      />

      <CreateFolderDialog
        open={!!showCreateFolder}
        onClose={() => setShowCreateFolder(null)}
        onCreate={handleCreateFolder}
      />

      {showRename && (
        <RenameDialog
          open
          currentName={showRename.name}
          onClose={() => setShowRename(null)}
          onRename={handleRename}
        />
      )}

      {showDelete && (
        <ConfirmDeleteDialog
          open
          itemName={showDelete.name}
          onClose={() => setShowDelete(null)}
          onConfirm={handleDelete}
        />
      )}

      {showDuplicateCol && (
        <DuplicateCollectionDialog
          open
          originalName={showDuplicateCol.name}
          onClose={() => setShowDuplicateCol(null)}
          onDuplicate={handleDuplicateCollection}
        />
      )}

      <SaveRequestDialog
        open={showSaveRequest}
        onClose={() => { setShowSaveRequest(false); setSaveTarget(null); setCloneSource(null); }}
        collections={collections.map((c) => ({ id: c.id, name: c.name }))}
        onSave={cloneSource ? handleCloneSave : handleSaveRequest}
        defaultName={cloneSource ? cloneSource.name : (activeTab?.name ?? "")}
        collectionTrees={collectionTrees}
        onRequestCollectionTree={loadCollectionTree}
        defaultCollectionId={saveTarget?.collectionId ?? activeTab?.collectionId}
        defaultFolderId={saveTarget?.folderId}
      />

      <EnvironmentManager
        open={showEnvManager}
        onClose={() => setShowEnvManager(false)}
        environments={environments}
        onCreateEnv={handleCreateEnv}
        onUpdateEnv={handleUpdateEnv}
        onDeleteEnv={handleDeleteEnv}
        onSetVariables={handleSetVariables}
        workspaceId={currentWorkspaceId}
      />

      <HistoryPanel
        open={showHistory}
        onClose={() => setShowHistory(false)}
        onLoadRequest={handleLoadFromHistory}
      />

      <WorkspaceManager
        open={showWorkspaces}
        onClose={() => setShowWorkspaces(false)}
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        onSelectWorkspace={handleSelectWorkspace}
        onRefresh={loadWorkspaces}
      />

      <AICollectionWizard
        open={showAIWizard}
        onClose={() => setShowAIWizard(false)}
        onComplete={() => { loadCollections(); setShowAIWizard(false); }}
        workspaceId={currentWorkspaceId}
      />

      <ImportExportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={loadCollections}
        workspaceId={currentWorkspaceId}
        collections={collections}
        onExportCollection={async (colId) => {
          try {
            const { data } = await importExportApi.exportPostman(colId);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${data.info?.name || "collection"}.postman_collection.json`;
            a.click();
            URL.revokeObjectURL(url);
            setSnack({ msg: t("collection.exportSuccess"), severity: "success" });
          } catch {
            setSnack({ msg: t("common.error"), severity: "error" });
          }
        }}
      />

      <SDKGeneratorDialog
        open={showSDK}
        onClose={() => setShowSDK(false)}
        collections={collections}
      />

      {/* Test Flow List */}
      <TestFlowListDialog
        open={showTestFlowList}
        onClose={() => setShowTestFlowList(false)}
        onOpenFlow={handleOpenTestFlow}
        workspaceId={currentWorkspaceId}
      />

      {/* Collection Runner */}
      {showRunner && (
        <CollectionRunnerDialog
          open={!!showRunner}
          onClose={() => setShowRunner(null)}
          collectionId={showRunner.id}
          collectionName={showRunner.name}
          environments={environments}
          selectedEnvId={selectedEnvId}
          onVariablesChanged={() => { loadGlobals(); loadEnvironments(); loadCollections(); }}
        />
      )}

      {/* Documentation Generator */}
      {showDocGen && (
        <DocGeneratorDialog
          open={!!showDocGen}
          onClose={() => setShowDocGen(null)}
          collectionId={showDocGen.collectionId}
          collectionName={showDocGen.collectionName}
          folderId={showDocGen.folderId}
          folderName={showDocGen.folderName}
        />
      )}

      {/* Share Documentation */}
      {showShareDocs && (
        <ShareManageDialog
          open={!!showShareDocs}
          onClose={() => setShowShareDocs(null)}
          collectionId={showShareDocs.collectionId}
          collectionName={showShareDocs.collectionName}
          folderId={showShareDocs.folderId}
          folderName={showShareDocs.folderName}
        />
      )}

      {/* AI Agent Chat Drawer */}
      <AIAgentDrawer
        open={showAIAgent}
        onClose={() => setShowAIAgent(false)}
        collections={collections}
        activeTab={activeTab}
        currentWorkspaceId={currentWorkspaceId}
        currentUserId={user.id}
        onApplyScript={(payload: ApplyScriptPayload) => {
          if (payload.scope === "collection") {
            // Apply to collection
            const collectionId = activeTab?.collectionId;
            if (!collectionId) {
              setSnack({ msg: t("aiAgent.noCollectionContext"), severity: "error" });
              return;
            }
            const field = payload.target === "pre-request" ? "pre_request_script" : "post_response_script";
            collectionsApi.update(collectionId, { [field]: payload.script })
              .then(() => {
                loadCollections();
                setSnack({ msg: t("aiAgent.scriptAppliedToCollection"), severity: "success" });
              })
              .catch(() => {
                setSnack({ msg: t("common.error"), severity: "error" });
              });
          } else {
            // Apply to current request tab
            if (!activeTabId) return;
            if (payload.target === "pre-request") {
              updateTab(activeTabId, { preRequestScript: payload.script });
            } else {
              updateTab(activeTabId, { postResponseScript: payload.script });
            }
            setSnack({ msg: t("aiAgent.scriptAppliedToRequest"), severity: "success" });
          }
        }}
      />



      {/* Snackbar */}
      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {snack ? <Alert severity={snack.severity} onClose={() => setSnack(null)}>{snack.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
    </ProxyModeContext.Provider>
  );
}
