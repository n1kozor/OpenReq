import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Box, Toolbar, Snackbar, Alert } from "@mui/material";
import { useTranslation } from "react-i18next";
import TopBar from "./TopBar";
import Sidebar from "./Sidebar";
import TabBar from "./TabBar";
import RequestBuilder from "@/components/request/RequestBuilder";
import ResponsePanel from "@/components/request/ResponsePanel";
import CollectionDetail from "@/components/collection/CollectionDetail";
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
import CodeGenDialog from "@/components/codegen/CodeGenDialog";
import SDKGeneratorDialog from "@/components/sdk/SDKGeneratorDialog";
import CollectionRunnerDialog from "@/components/collection/CollectionRunnerDialog";
import ScriptEditor from "@/components/request/ScriptEditor";
import WebSocketPanel from "@/components/websocket/WebSocketPanel";
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
import type {
  RequestTab,
  HttpMethod,
  BodyType,
  AuthType,
  Collection,
  CollectionItem,
  Environment,
  Workspace,
  User,
  OAuthConfig,
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

function createNewTab(): RequestTab {
  return {
    id: `tab-${tabCounter++}`,
    name: "New Request",
    method: "GET",
    url: "",
    isDirty: false,
    headers: [newPair()],
    queryParams: [newPair()],
    body: "",
    bodyType: "none",
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
    scriptResult: null,
    preRequestResult: null,
  };
}

function stripRuntimeTab(tab: RequestTab): RequestTab {
  return {
    ...tab,
    response: null,
    scriptResult: null,
    preRequestResult: null,
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
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    () => localStorage.getItem("openreq-workspace") ?? null
  );

  // Dialog state
  const [showCreateCol, setShowCreateCol] = useState(false);
  const [showEditCol, setShowEditCol] = useState<{ id: string; name: string; description?: string; visibility: "private" | "shared"; variables?: Record<string, string> | null } | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState<string | null>(null);
  const [showRename, setShowRename] = useState<{ id: string; name: string; type: "collection" | "item" } | null>(null);
  const [showDelete, setShowDelete] = useState<{ id: string; name: string; type: "collection" | "item" } | null>(null);
  const [showDuplicateCol, setShowDuplicateCol] = useState<{ id: string; name: string } | null>(null);
  const [showSaveRequest, setShowSaveRequest] = useState(false);
  const [saveTarget, setSaveTarget] = useState<{ collectionId?: string; folderId?: string } | null>(null);
  const [showEnvManager, setShowEnvManager] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(false);
  const [showAIWizard, setShowAIWizard] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCodeGen, setShowCodeGen] = useState(false);
  const [showWebSocket, setShowWebSocket] = useState(false);
  const [showSDK, setShowSDK] = useState(false);
  const [showAIAgent, setShowAIAgent] = useState(false);
  const [showTestFlowList, setShowTestFlowList] = useState(false);
  const [showRunner, setShowRunner] = useState<{ id: string; name: string } | null>(null);
  const didInitCollections = useRef(false);
  const didInitWorkspaces = useRef(false);
  const lastEnvWorkspaceId = useRef<string | null>(null);
  const loadingAllItemsRef = useRef(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  // Active tab's collection variables for variable highlighting
  const activeCollectionVars = useMemo(() => {
    if (!activeTab?.collectionId) return {};
    return collections.find((c) => c.id === activeTab.collectionId)?.variables ?? {};
  }, [activeTab?.collectionId, collections]);

  // Variable groups for ScriptEditor (RequestBuilder computes its own)
  const activeEnvIdResolved = activeTab?.envOverrideId ?? selectedEnvId;
  const activeEnvVariables = useMemo(() => {
    const env = environments.find((e) => e.id === activeEnvIdResolved);
    return env?.variables ?? [];
  }, [environments, activeEnvIdResolved]);
  const { groups: scriptVarGroups, resolved: scriptVarResolved } = useVariableGroups(
    activeEnvVariables,
    activeCollectionVars,
  );

  // ── Load data ──
  const loadCollections = useCallback(async () => {
    try {
      const { data: cols } = await collectionsApi.list();
      setCollections(cols);
      // Clear cached items/trees so they reload fresh
      setCollectionItems({});
      setCollectionTrees({});
    } catch { /* ignore */ }
  }, []);

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
  useEffect(() => {
    if (lastEnvWorkspaceId.current === currentWorkspaceId) return;
    lastEnvWorkspaceId.current = currentWorkspaceId;
    loadEnvironments();
  }, [loadEnvironments, currentWorkspaceId]);

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

  const handleNewTab = useCallback(() => {
    const t = createNewTab();
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
        scriptResult: null,
        preRequestResult: null,
      };
      setActiveTabId(copy.id);
      return [...prev, copy];
    });
  }, []);

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

    if (tab.bodyType === "json" || tab.bodyType === "xml" || tab.bodyType === "text") {
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

    setLoading(true);
    try {
      const { data: response } = await proxyApi.send({
        method: tab.method,
        url: resolvedUrl,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: bodyToSend,
        body_type: tab.bodyType,
        form_data: formDataToSend,
        query_params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
        auth_type: authType === "oauth2" ? "bearer" : authType,
        auth_config: Object.keys(authConfig).length > 0 ? authConfig : undefined,
        environment_id: tab.envOverrideId ?? selectedEnvId ?? undefined,
        collection_id: tab.collectionId,
        pre_request_script: tab.preRequestScript?.trim() || undefined,
        post_response_script: tab.postResponseScript?.trim() || undefined,
        script_language: tab.scriptLanguage || "javascript",
        request_settings: isDefaultSettings ? undefined : requestSettings,
      });
      updateTab(activeTabId, {
        response,
        preRequestResult: response.pre_request_result ?? null,
        scriptResult: response.script_result ?? null,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("request.failed");
      setSnack({ msg: message, severity: "error" });
    } finally {
      setLoading(false);
    }
  }, [tabs, activeTabId, selectedEnvId, updateTab, buildAuthConfig, fileToBase64]);

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
    return {
      headers, queryParams,
      auth_config: Object.keys(authConfig).length > 0 ? authConfig : null,
      form_data: formData,
      settings,
    };
  }, []);

  // Quick save: update existing request (no dialog)
  const handleQuickSave = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab?.savedRequestId) return;

    const { headers, queryParams, auth_config, form_data, settings } = buildTabPayload(tab);
    try {
      await requestsApi.update(tab.savedRequestId, {
        name: tab.name, method: tab.method, url: tab.url,
        headers, body: tab.body, body_type: tab.bodyType,
        auth_type: tab.authType, auth_config: auth_config as Record<string, string>,
        query_params: queryParams,
        pre_request_script: tab.preRequestScript || null,
        post_response_script: tab.postResponseScript || null,
        form_data: form_data as any,
        settings: settings as any,
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

    const { headers, queryParams, auth_config, form_data, settings } = buildTabPayload(tab);
    try {
      const { data: req } = await requestsApi.create({
        name, method: tab.method, url: tab.url,
        headers, body: tab.body, body_type: tab.bodyType,
        auth_type: tab.authType, auth_config: auth_config as Record<string, string>,
        query_params: queryParams,
        pre_request_script: tab.preRequestScript || null,
        post_response_script: tab.postResponseScript || null,
        form_data: form_data as any,
        settings: settings as any,
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
  const handleSelectRequest = useCallback(async (requestId: string, collectionId?: string) => {
    const existingTab = tabs.find((t) => t.savedRequestId === requestId);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      setView("request");
      return;
    }

    try {
      const { data: req } = await requestsApi.get(requestId);
      const tab = createNewTab();
      tab.name = req.name;
      tab.method = req.method;
      tab.url = req.url;
      tab.savedRequestId = req.id;
      tab.collectionId = collectionId;
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
    await collectionsApi.createItem(showCreateFolder, { name, is_folder: true });
    loadCollections();
  }, [showCreateFolder, loadCollections]);

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
      const requestId = Object.values(collectionItems)
        .flat()
        .find((item) => item.id === showRename.id)?.request_id;
      if (requestId) {
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
    if (showDelete.type === "collection") {
      await collectionsApi.delete(showDelete.id);
    } else {
      await collectionsApi.deleteItem(showDelete.id);
    }
    loadCollections();
  }, [showDelete, loadCollections]);

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

  // ── Environment operations ──
  const handleCreateEnv = useCallback(async (name: string, envType: string, variables: { key: string; value: string; is_secret: boolean }[]) => {
    if (!currentWorkspaceId) {
      setSnack({ msg: t("workspace.createFirst"), severity: "error" });
      return;
    }
    await environmentsApi.create({ name, env_type: envType, workspace_id: currentWorkspaceId, variables });
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
  }, []);

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

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);

  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <TopBar
        mode={mode}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
        username={user.username}
        environments={environments}
        selectedEnvironmentId={selectedEnvId}
        onSelectEnvironment={handleSelectEnvironment}
        workspaceName={currentWorkspace?.name}
      />

      <Sidebar
        collections={collections}
        collectionItems={collectionItems}
        collectionTrees={collectionTrees}
        collectionTreeLoading={collectionTreeLoading}
        onSelectRequest={handleSelectRequest}
        onOpenCollection={handleOpenCollection}
        onNewCollection={() => setShowCreateCol(true)}
        onNewFolder={(colId) => setShowCreateFolder(colId)}
        onNewRequest={handleNewRequest}
        onEditCollection={(id, name, description, visibility, variables) => setShowEditCol({ id, name, description, visibility, variables })}
        onRenameCollection={(id, name) => setShowRename({ id, name, type: "collection" })}
        onDeleteCollection={(id, name) => setShowDelete({ id, name, type: "collection" })}
        onDuplicateCollection={(id, name) => setShowDuplicateCol({ id, name })}
        onRenameItem={(id, name) => setShowRename({ id, name, type: "item" })}
        onDeleteItem={(id, name) => setShowDelete({ id, name, type: "item" })}
        onRunCollection={handleRunCollection}
        onOpenEnvironments={() => setShowEnvManager(true)}
        onOpenHistory={() => setShowHistory(true)}
        onOpenSettings={() => setView("settings")}
        onOpenWorkspaces={() => setShowWorkspaces(true)}
        onOpenAIWizard={() => setShowAIWizard(true)}
        onOpenImport={() => setShowImport(true)}
        onOpenWebSocket={() => setShowWebSocket(true)}
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
        onRequestCollectionTree={loadCollectionTree}
        onRequestAllCollectionItems={loadAllCollectionItems}
        onMoveItem={handleMoveItem}
        onOpenCodeGen={() => setShowCodeGen(true)}
        onOpenSDK={() => setShowSDK(true)}
        onOpenAIAgent={() => setShowAIAgent(true)}
        onOpenTestBuilder={() => setShowTestFlowList(true)}
      />

      <Box sx={{
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "margin-right 225ms cubic-bezier(0, 0, 0.2, 1)",
        marginRight: showAIAgent ? `${DRAWER_WIDTH}px` : 0,
      }}>
        <Toolbar sx={{ minHeight: "52px !important" }} />

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
            />

            {/* Dashboard: when no tabs are open */}
            {tabs.length === 0 && (
              <Dashboard
                collections={collections}
                collectionItems={collectionItems}
                onNewRequest={handleNewTab}
                onNewCollection={() => setShowCreateCol(true)}
                onOpenImport={() => setShowImport(true)}
                onOpenAIWizard={() => setShowAIWizard(true)}
                onOpenHistory={() => setShowHistory(true)}
                onOpenWebSocket={() => setShowWebSocket(true)}
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
                />
              </ReactFlowProvider>
            )}

            {/* Request Builder: normal request tab */}
            {activeTab && activeTab.tabType !== "collection" && activeTab.tabType !== "testflow" && (
              <PanelGridLayout showWebSocket={showWebSocket}>
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
                      onSave={() => activeTab.savedRequestId ? handleQuickSave() : setShowSaveRequest(true)}
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
                    <ResponsePanel response={activeTab.response} />
                  ),
                  webSocketPanel: (
                    <WebSocketPanel open={true} />
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
        onClose={() => { setShowSaveRequest(false); setSaveTarget(null); }}
        collections={collections.map((c) => ({ id: c.id, name: c.name }))}
        onSave={handleSaveRequest}
        defaultName={activeTab?.name ?? ""}
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

      <CodeGenDialog
        open={showCodeGen}
        onClose={() => setShowCodeGen(false)}
        method={activeTab?.method ?? "GET"}
        url={activeTab?.url ?? ""}
        headers={(() => {
          if (!activeTab) return undefined;
          const h: Record<string, string> = {};
          for (const pair of activeTab.headers) {
            if (pair.enabled && pair.key) h[pair.key] = pair.value;
          }
          return Object.keys(h).length > 0 ? h : undefined;
        })()}
        body={activeTab?.body || undefined}
        bodyType={activeTab?.bodyType ?? "none"}
        queryParams={(() => {
          if (!activeTab) return undefined;
          const p: Record<string, string> = {};
          for (const pair of activeTab.queryParams) {
            if (pair.enabled && pair.key) p[pair.key] = pair.value;
          }
          return Object.keys(p).length > 0 ? p : undefined;
        })()}
        authType={activeTab?.authType ?? "none"}
        authConfig={(() => {
          if (!activeTab) return undefined;
          const c: Record<string, string> = {};
          if (activeTab.authType === "bearer") c.token = activeTab.bearerToken;
          else if (activeTab.authType === "basic") { c.username = activeTab.basicUsername; c.password = activeTab.basicPassword; }
          else if (activeTab.authType === "api_key") { c.key = activeTab.apiKeyName; c.value = activeTab.apiKeyValue; c.placement = activeTab.apiKeyPlacement; }
          return Object.keys(c).length > 0 ? c : undefined;
        })()}
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
  );
}
