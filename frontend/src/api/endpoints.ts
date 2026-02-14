import client, { API_URL } from "./client";
import type {
  Token,
  User,
  Workspace,
  Collection,
  CollectionItem,
  ApiRequest,
  ProxyResponse,
  Environment,
  HttpMethod,
  AuthType,
  AIGenerateResult,
  GeneratedEndpointFull,
  PostmanImportPreview,
  PostmanImportResult,
  AppSettings,
  CollectionRunSummary,
  CollectionRunDetail,
} from "@/types";

// ── Auth ──
export const authApi = {
  login: (email: string, password: string) =>
    client.post<Token>("/auth/login", { email, password }),
  register: (data: { email: string; username: string; password: string; full_name?: string }) =>
    client.post<User>("/auth/register", data),
};

// ── Setup ──
export const setupApi = {
  status: () => client.get<{ setup_required: boolean }>("/setup/status"),
  initialize: (data: {
    email: string;
    username: string;
    password: string;
    full_name?: string;
    openai_api_key?: string;
    workspace_name: string;
    environments: { name: string; env_type: string }[];
  }) =>
    client.post<{ access_token: string; token_type: string; user: User }>(
      "/setup/initialize",
      data
    ),
};

// ── Users ──
export const usersApi = {
  me: () => client.get<User>("/users/me"),
  update: (data: { full_name?: string }) =>
    client.patch<User>("/users/me", data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    client.put("/users/me/password", data),
  list: () => client.get<User[]>("/users/"),
  adminUpdate: (userId: string, data: { is_active?: boolean; full_name?: string }) =>
    client.patch<User>(`/users/${userId}`, data),
  deleteUser: (userId: string) => client.delete(`/users/${userId}`),
};

// ── App Settings (global) ──
export const appSettingsApi = {
  get: () => client.get<AppSettings>("/settings/"),
  update: (data: { openai_api_key?: string }) =>
    client.patch<AppSettings>("/settings/", data),
};

// ── Workspaces ──
export const workspacesApi = {
  list: () => client.get<Workspace[]>("/workspaces/"),
  get: (id: string) => client.get<Workspace>(`/workspaces/${id}`),
  create: (data: { name: string; description?: string }) =>
    client.post<Workspace>("/workspaces/", data),
  update: (id: string, data: { name?: string; description?: string }) =>
    client.patch<Workspace>(`/workspaces/${id}`, data),
  delete: (id: string) => client.delete(`/workspaces/${id}`),
  listMembers: (workspaceId: string) =>
    client.get<{ id: string; user_id: string; role: string; username: string; email: string }[]>(
      `/workspaces/${workspaceId}/members`
    ),
  addMember: (workspaceId: string, userId: string, role: string) =>
    client.post(`/workspaces/${workspaceId}/members`, { user_id: userId, role }),
  removeMember: (workspaceId: string, userId: string) =>
    client.delete(`/workspaces/${workspaceId}/members/${userId}`),
  listAvailable: () => client.get<Workspace[]>("/workspaces/available"),
  join: (workspaceId: string) =>
    client.post(`/workspaces/join/${workspaceId}`),
};

// ── Collections ──
export const collectionsApi = {
  list: (workspaceId?: string) =>
    client.get<Collection[]>("/collections/", { params: workspaceId ? { workspace_id: workspaceId } : {} }),
  get: (id: string) => client.get<Collection>(`/collections/${id}`),
  create: (data: { name: string; description?: string; visibility?: string; workspace_id?: string; auth_type?: string | null; auth_config?: Record<string, string> | null; pre_request_script?: string | null; post_response_script?: string | null; script_language?: string | null }) =>
    client.post<Collection>("/collections/", data),
  update: (id: string, data: { name?: string; description?: string; visibility?: string; variables?: Record<string, string>; auth_type?: string | null; auth_config?: Record<string, string> | null; pre_request_script?: string | null; post_response_script?: string | null; script_language?: string | null }) =>
    client.patch<Collection>(`/collections/${id}`, data),
  delete: (id: string) => client.delete(`/collections/${id}`),
  listItems: (collectionId: string) =>
    client.get<CollectionItem[]>(`/collections/${collectionId}/items`),
  createItem: (collectionId: string, data: {
    name: string; is_folder?: boolean; parent_id?: string; request_id?: string; sort_order?: number;
  }) =>
    client.post<CollectionItem>(`/collections/${collectionId}/items`, data),
  updateItem: (itemId: string, data: { name?: string; sort_order?: number; parent_id?: string }) =>
    client.patch<CollectionItem>(`/collections/items/${itemId}`, data),
  deleteItem: (itemId: string) => client.delete(`/collections/items/${itemId}`),
  reorder: (collectionId: string, items: { id: string; sort_order: number; parent_id?: string }[]) =>
    client.put(`/collections/${collectionId}/reorder`, { items }),
};

// ── Requests ──
export const requestsApi = {
  get: (id: string) => client.get<ApiRequest>(`/requests/${id}`),
  create: (data: Partial<ApiRequest> & { name: string; url: string }) =>
    client.post<ApiRequest>("/requests/", data),
  update: (id: string, data: Partial<ApiRequest>) =>
    client.patch<ApiRequest>(`/requests/${id}`, data),
  delete: (id: string) => client.delete(`/requests/${id}`),
};

// ── Environments ──
export const environmentsApi = {
  list: (workspaceId: string) =>
    client.get<Environment[]>("/environments/", { params: { workspace_id: workspaceId } }),
  get: (id: string) => client.get<Environment>(`/environments/${id}`),
  create: (data: {
    name: string; env_type: string; workspace_id: string;
    variables?: { key: string; value: string; is_secret: boolean }[];
  }) =>
    client.post<Environment>("/environments/", data),
  update: (id: string, data: { name?: string; env_type?: string }) =>
    client.patch<Environment>(`/environments/${id}`, data),
  delete: (id: string) => client.delete(`/environments/${id}`),
  setVariables: (id: string, variables: { key: string; value: string; is_secret: boolean }[]) =>
    client.put<Environment>(`/environments/${id}/variables`, variables),
};

// ── Proxy ──
export const proxyApi = {
  send: (data: {
    method: HttpMethod;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    body_type?: string;
    form_data?: { key: string; value: string; type: string; enabled: boolean; file_name?: string | null; file_content_base64?: string | null }[];
    query_params?: Record<string, string>;
    auth_type?: AuthType;
    auth_config?: Record<string, string>;
    environment_id?: string;
    collection_id?: string;
    pre_request_script?: string;
    post_response_script?: string;
    script_language?: string;
    request_settings?: {
      http_version: string;
      verify_ssl: boolean;
      follow_redirects: boolean;
      follow_original_method: boolean;
      follow_auth_header: boolean;
      remove_referer_on_redirect: boolean;
      encode_url: boolean;
      max_redirects: number;
      disable_cookie_jar: boolean;
      use_server_cipher_suite: boolean;
      disabled_tls_protocols: string[];
    };
  }) => client.post<ProxyResponse>("/proxy/send", data),

  runCollection: (
    collectionId: string,
    folderId?: string,
    environmentId?: string,
    iterations?: number,
    delayMs?: number,
  ) =>
    client.post(`/proxy/run/${collectionId}`, null, {
      params: {
        folder_id: folderId,
        environment_id: environmentId,
        iterations: iterations ?? 1,
        delay_ms: delayMs ?? 0,
      },
    }),
};

// ── History ──
export interface HistoryEntry {
  id: string;
  method: string;
  url: string;
  status_code: number | null;
  elapsed_ms: number | null;
  size_bytes: number | null;
  created_at: string;
}

export interface HistoryDetail extends HistoryEntry {
  request_headers: Record<string, string> | null;
  request_body: string | null;
  response_headers: Record<string, string> | null;
  response_body: string | null;
}

// ── AI ──
export interface StreamCallbacks {
  onStep: (phase: string, status: string, extra?: Record<string, unknown>) => void;
  onAiOutput: (text: string, type: string, chars?: number) => void;
  onEndpoints: (endpoints: GeneratedEndpointFull[], total: number) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

export const aiApi = {
  generateCollection: (data: {
    documentation?: string;
    collection_name?: string;
    collection_names?: string[];
    custom_instructions?: string;
    workspace_id?: string;
    source_url?: string;
  }) =>
    client.post<AIGenerateResult>("/ai/generate-collection", data, {
      timeout: data.source_url ? 600_000 : 120_000,
    }),

  streamGenerate: (
    data: {
      documentation?: string;
      collection_name?: string;
      collection_names?: string[];
      custom_instructions?: string;
      workspace_id?: string;
      source_url?: string;
    },
    callbacks: StreamCallbacks,
  ): AbortController => {
    const ctrl = new AbortController();
    const token = localStorage.getItem("openreq-token");

    fetch(`${API_URL}/api/v1/ai/generate-stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
      signal: ctrl.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const err = await response.json().catch(() => ({ detail: "Stream failed" }));
          callbacks.onError(err.detail || "Generation failed");
          return;
        }
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            if (!part.trim()) continue;
            let event = "";
            let dataStr = "";
            for (const line of part.split("\n")) {
              if (line.startsWith("event: ")) event = line.slice(7);
              else if (line.startsWith("data: ")) dataStr += line.slice(6);
            }
            if (!event || !dataStr) continue;

            try {
              const parsed = JSON.parse(dataStr);
              switch (event) {
                case "step":
                  callbacks.onStep(parsed.phase, parsed.status, parsed);
                  break;
                case "ai_output":
                  callbacks.onAiOutput(parsed.text, parsed.type || "content", parsed.chars);
                  break;
                case "endpoints":
                  callbacks.onEndpoints(parsed.endpoints, parsed.total);
                  break;
                case "error":
                  callbacks.onError(parsed.message);
                  break;
                case "done":
                  callbacks.onDone();
                  break;
              }
            } catch {
              /* skip malformed events */
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          callbacks.onError(err.message || "Stream connection failed");
        }
      });

    return ctrl;
  },

  createFromEndpoints: (data: {
    collection_name?: string;
    collection_names?: string[];
    use_folders?: boolean;
    workspace_id?: string;
    source_url?: string;
    endpoints: GeneratedEndpointFull[];
  }) => client.post<AIGenerateResult>("/ai/create-from-endpoints", data),
};

// ── History ──
export const historyApi = {
  list: (limit = 50, offset = 0) =>
    client.get<HistoryEntry[]>("/history/", { params: { limit, offset } }),
  get: (id: string) => client.get<HistoryDetail>(`/history/${id}`),
  clear: () => client.delete("/history/"),
};

// ── Import/Export ──
export const importExportApi = {
  importPostman: (file: File, workspaceId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (workspaceId) formData.append("workspace_id", workspaceId);
    return client.post("/import-export/import/postman", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  importOpenApi: (file: File, workspaceId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (workspaceId) formData.append("workspace_id", workspaceId);
    return client.post("/import-export/import/openapi", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  importCurl: (curlCommand: string, name?: string, collectionId?: string) =>
    client.post("/import-export/import/curl", {
      curl_command: curlCommand,
      name,
      collection_id: collectionId,
    }),
  exportCurl: (data: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    query_params?: Record<string, string>;
    auth_type?: string;
    auth_config?: Record<string, string>;
  }) => client.post<{ curl: string }>("/import-export/export/curl", data),
  exportPostman: (collectionId: string) =>
    client.get(`/import-export/export/postman/${collectionId}`),
  exportPostmanFolder: (folderId: string) =>
    client.get(`/import-export/export/postman/folder/${folderId}`),
  exportPostmanRequest: (requestId: string) =>
    client.get(`/import-export/export/postman/request/${requestId}`),

  previewPostmanImport: (
    collectionFile: File,
    environmentFiles: File[],
    globalsFile?: File,
  ) => {
    const formData = new FormData();
    formData.append("collection_file", collectionFile);
    environmentFiles.forEach((f) => formData.append("environment_files", f));
    if (globalsFile) formData.append("globals_file", globalsFile);
    return client.post<PostmanImportPreview>("/import-export/import/postman/preview", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  importPostmanFull: (
    collectionFile: File,
    workspaceId: string,
    environmentFiles: File[],
    globalsFile?: File,
    envTypeMapping?: Record<string, string>,
  ) => {
    const formData = new FormData();
    formData.append("collection_file", collectionFile);
    formData.append("workspace_id", workspaceId);
    environmentFiles.forEach((f) => formData.append("environment_files", f));
    if (globalsFile) formData.append("globals_file", globalsFile);
    if (envTypeMapping) formData.append("env_type_mapping", JSON.stringify(envTypeMapping));
    return client.post<PostmanImportResult>("/import-export/import/postman/full", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

// ── Code Generation ──
export const codegenApi = {
  generate: (data: {
    language: string;
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    body_type?: string;
    query_params?: Record<string, string>;
    auth_type?: string;
    auth_config?: Record<string, string>;
  }) => client.post<{ code: string; language: string }>("/codegen/generate", data),
  languages: () =>
    client.get<{ languages: Record<string, string> }>("/codegen/languages"),
};

// ── Scripts ──
export const scriptsApi = {
  runPreRequest: (data: {
    script: string;
    variables?: Record<string, string>;
    language?: string;
  }) => client.post("/codegen/scripts/pre-request", data),
  runPostResponse: (data: {
    script: string;
    variables?: Record<string, string>;
    response_status?: number;
    response_body?: string;
    response_headers?: Record<string, string>;
    response_time?: number;
    language?: string;
  }) => client.post("/codegen/scripts/post-response", data),
  generateWithAI: (data: {
    description: string;
    script_type: "pre-request" | "post-response";
    language?: string;
  }) => client.post<{ script: string; script_type: string }>("/codegen/scripts/generate", data),
};

// ── SDK Generation ──
export const sdkApi = {
  generate: async (collectionId: string, language: "csharp" | "python") => {
    const response = await client.post(
      "/sdk/generate",
      { collection_id: collectionId, language },
      { responseType: "blob" }
    );
    return response;
  },
};

// ── Collection Runs ──
export const runsApi = {
  save: (data: {
    collection_id: string;
    collection_name: string;
    environment_id?: string | null;
    environment_name?: string | null;
    iterations: number;
    delay_ms: number;
    status: string;
    total_requests: number;
    passed_count: number;
    failed_count: number;
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    total_time_ms: number;
    results: {
      iteration: number;
      sort_index: number;
      item_id: string;
      request_name: string;
      method: string;
      status: string;
      error?: string | null;
      status_code?: number | null;
      elapsed_ms?: number | null;
      size_bytes?: number | null;
      response_headers?: Record<string, string> | null;
      response_body?: string | null;
      test_results?: { name: string; passed: boolean; error: string | null }[] | null;
      console_logs?: string[] | null;
    }[];
  }) => client.post<CollectionRunSummary>("/runs/", data),

  list: (collectionId: string, limit = 50, offset = 0) =>
    client.get<CollectionRunSummary[]>("/runs/", {
      params: { collection_id: collectionId, limit, offset },
    }),

  get: (runId: string) =>
    client.get<CollectionRunDetail>(`/runs/${runId}`),

  delete: (runId: string) =>
    client.delete(`/runs/${runId}`),

  exportDownload: async (runId: string, format: "json" | "html") => {
    const response = await client.get(`/runs/${runId}/export`, {
      params: { format },
      responseType: "blob",
    });
    const blob = response.data as Blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-report-${runId.slice(0, 8)}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// ── OAuth ──
export const oauthApi = {
  exchangeToken: (data: {
    grant_type: string;
    token_url: string;
    client_id: string;
    client_secret?: string;
    code?: string;
    redirect_uri?: string;
    code_verifier?: string;
    scope?: string;
    refresh_token?: string;
  }) => client.post("/oauth/token", data),
  generatePkce: () => client.post("/oauth/pkce"),
};
