export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type AuthType = "none" | "bearer" | "api_key" | "basic" | "oauth2";

export type BodyType = "none" | "json" | "xml" | "text" | "form-data" | "x-www-form-urlencoded";

export type Role = "admin" | "editor" | "viewer";

export type EnvironmentType = "LIVE" | "TEST" | "DEV";

export type CollectionVisibility = "private" | "shared";

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
  type?: "text" | "file";
  file?: File | null;
  fileName?: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  is_active: boolean;
}

export interface AppSettings {
  has_openai_key: boolean;
  openai_api_key_hint: string | null;
  ai_provider: "openai" | "ollama";
  ollama_base_url: string | null;
  ollama_model: string | null;
  has_ollama_url: boolean;
}

export interface OllamaModel {
  name: string;
  size: number | null;
  modified_at: string | null;
}

export interface AIGenerateResult {
  collection_id?: string | null;
  collection_name?: string | null;
  collections?: { id: string; name: string; total_requests: number }[] | null;
  endpoints: { name: string; method: string; url: string; folder: string | null; collection?: string | null }[];
  total: number;
}

export interface GeneratedEndpointFull {
  name: string;
  method: string;
  url: string;
  folder: string | null;
  collection?: string | null;
  headers?: Record<string, string>;
  query_params?: Record<string, string>;
  body?: string | null;
  body_type?: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  visibility: CollectionVisibility;
  owner_id: string;
  workspace_id: string | null;
  variables: Record<string, string> | null;
  auth_type: AuthType | null;
  auth_config: Record<string, string> | null;
  pre_request_script: string | null;
  post_response_script: string | null;
  script_language: string | null;
}

export interface CollectionItem {
  id: string;
  name: string;
  is_folder: boolean;
  parent_id: string | null;
  request_id: string | null;
  sort_order: number;
  method?: string | null;
  children?: CollectionItem[];
}

export interface ApiRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: Record<string, string> | null;
  body: string | null;
  body_type: string | null;
  auth_type: AuthType;
  auth_config: Record<string, string> | null;
  query_params: Record<string, string> | null;
  pre_request_script: string | null;
  post_response_script: string | null;
  form_data: FormDataItemSaved[] | null;
  settings: RequestSettings | null;
}

export interface FormDataItemSaved {
  key: string;
  value: string;
  type: "text" | "file";
  enabled: boolean;
  file_name?: string | null;
}

// ── Postman Import Types ──

export interface PostmanImportPreview {
  collection: {
    name: string;
    description: string;
    total_requests: number;
    total_folders: number;
    collection_variables_count: number;
    has_pre_request_script: boolean;
    has_post_response_script: boolean;
    request_scripts_count: number;
  };
  environments: {
    filename: string;
    name: string;
    variables_count: number;
    detected_type: EnvironmentType;
    variables: string[];
    error?: boolean;
  }[];
  globals: {
    filename: string;
    name: string;
    variables_count: number;
    error?: boolean;
  } | null;
  variables_used_in_collection: string[];
  variables_provided: string[];
}

export interface PostmanImportResult {
  collection: {
    id: string;
    name: string;
    total_requests: number;
    total_folders: number;
    collection_variables_count: number;
  };
  environments: {
    id: string;
    name: string;
    env_type: EnvironmentType;
    variables_count: number;
  }[];
  globals: { id: string; name: string; variables_count: number } | null;
  request_scripts_count: number;
  errors: string[];
}

export interface ProxyResponse {
  status_code: number;
  headers: Record<string, string>;
  body: string;
  elapsed_ms: number;
  size_bytes: number;
  is_binary: boolean;
  content_type: string;
  body_base64?: string | null;
  pre_request_result: ScriptResult | null;
  script_result: ScriptResult | null;
}

export interface Environment {
  id: string;
  name: string;
  env_type: EnvironmentType;
  workspace_id: string;
  variables: EnvironmentVariable[];
}

export interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  is_secret: boolean;
}

export interface OAuthConfig {
  grantType: "authorization_code" | "client_credentials";
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  usePkce: boolean;
  accessToken: string;
}

export interface ScriptResult {
  variables: Record<string, string>;
  globals: Record<string, string>;
  logs: string[];
  test_results: { name: string; passed: boolean; error: string | null }[];
}

export interface WebSocketMessage {
  data: string;
  timestamp: number;
  direction: "sent" | "received";
}

export type TabType = "request" | "collection";

export type ScriptLanguage = "javascript" | "python";

export interface RequestSettings {
  httpVersion: "http1" | "http2";
  verifySsl: boolean;
  followRedirects: boolean;
  followOriginalMethod: boolean;
  followAuthHeader: boolean;
  removeRefererOnRedirect: boolean;
  encodeUrl: boolean;
  maxRedirects: number;
  disableCookieJar: boolean;
  useServerCipherSuite: boolean;
  disabledTlsProtocols: string[];
}

export const defaultRequestSettings: RequestSettings = {
  httpVersion: "http2",
  verifySsl: true,
  followRedirects: true,
  followOriginalMethod: false,
  followAuthHeader: false,
  removeRefererOnRedirect: false,
  encodeUrl: true,
  maxRedirects: 10,
  disableCookieJar: false,
  useServerCipherSuite: false,
  disabledTlsProtocols: [],
};

export interface RequestTab {
  id: string;
  name: string;
  tabType?: TabType;
  method: HttpMethod;
  url: string;
  isDirty: boolean;
  savedRequestId?: string;
  collectionId?: string;
  headers: KeyValuePair[];
  queryParams: KeyValuePair[];
  body: string;
  bodyType: BodyType;
  formData: KeyValuePair[];
  authType: AuthType;
  bearerToken: string;
  basicUsername: string;
  basicPassword: string;
  apiKeyName: string;
  apiKeyValue: string;
  apiKeyPlacement: "header" | "query";
  oauthConfig: OAuthConfig;
  preRequestScript: string;
  postResponseScript: string;
  scriptLanguage: ScriptLanguage;
  pathParams: Record<string, string>;
  envOverrideId: string | null;
  requestSettings: RequestSettings;
  response: ProxyResponse | null;
  scriptResult: ScriptResult | null;
  preRequestResult: ScriptResult | null;
}

// ── Collection Runner Types ──

export interface CollectionRunResultItem {
  item_id: string;
  request_name: string;
  method: string;
  status: "success" | "error";
  error?: string;
  response?: ProxyResponse;
}

export interface CollectionRunIterationResult {
  iteration: number;
  results: CollectionRunResultItem[];
  total: number;
}

// ── Collection Run Report Types ──

export type CollectionRunStatus = "completed" | "stopped" | "failed";

export interface CollectionRunSummary {
  id: string;
  collection_id: string;
  collection_name: string;
  environment_name: string | null;
  iterations: number;
  delay_ms: number;
  status: CollectionRunStatus;
  total_requests: number;
  passed_count: number;
  failed_count: number;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  total_time_ms: number;
  created_at: string;
  finished_at: string | null;
}

export interface CollectionRunResultDetail {
  id: string;
  iteration: number;
  sort_index: number;
  item_id: string;
  request_name: string;
  method: string;
  status: "success" | "error";
  error: string | null;
  status_code: number | null;
  elapsed_ms: number | null;
  size_bytes: number | null;
  response_headers: Record<string, string> | null;
  response_body: string | null;
  test_results: { name: string; passed: boolean; error: string | null }[] | null;
  console_logs: string[] | null;
}

export interface CollectionRunDetail extends CollectionRunSummary {
  results: CollectionRunResultDetail[];
}

// ── Panel Layout Types ──

export type PanelId = "requestBuilder" | "scriptEditor" | "responsePanel" | "webSocketPanel";

export interface PanelLayoutItem {
  i: PanelId;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface PanelLayout {
  id: string;
  nameKey: string;
  items: PanelLayoutItem[];
}

export interface PersistedLayoutState {
  version: number;
  activePresetId: string;
  items: PanelLayoutItem[];
  minimizedPanels: PanelId[];
}

export interface CustomPreset {
  id: string;
  name: string;
  items: PanelLayoutItem[];
}

// ── AI Agent Chat Types ──

export interface AIConversation {
  id: string;
  title: string;
  provider: string;
  model: string | null;
  is_shared: boolean;
  workspace_id: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface AIChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  context_type: "collection" | "request" | null;
  context_id: string | null;
  context_name: string | null;
  created_at: string;
}
