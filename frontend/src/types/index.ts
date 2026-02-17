export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type AuthType = "none" | "bearer" | "api_key" | "basic" | "oauth2" | "inherit";

export type BodyType = "none" | "json" | "xml" | "text" | "form-data" | "x-www-form-urlencoded" | "graphql";

export type Protocol = "http" | "websocket" | "graphql";

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
  openai_model: string | null;
  ollama_base_url: string | null;
  ollama_model: string | null;
  has_ollama_url: boolean;
}

export interface OllamaModel {
  name: string;
  size: number | null;
  modified_at: string | null;
}

export interface OpenAIModel {
  id: string;
  owned_by: string | null;
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
  globals: Record<string, string> | null;
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
  protocol?: Protocol;
  children?: CollectionItem[];
  auth_type?: string | null;
  auth_config?: Record<string, string> | null;
  description?: string | null;
  variables?: Record<string, string> | null;
  pre_request_script?: string | null;
  post_response_script?: string | null;
  script_language?: string | null;
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
  protocol: Protocol;
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
  } | null;
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
  } | null;
  environments: {
    id: string;
    name: string;
    env_type: EnvironmentType;
    variables_count: number;
  }[];
  globals: { name: string; variables_count: number } | null;
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
  globals_updates?: Record<string, string | null>;
  environment_updates?: Record<string, string | null>;
  collection_var_updates?: Record<string, string | null>;
}

export interface WebSocketMessage {
  data: string;
  timestamp: number;
  direction: "sent" | "received";
}

export type TabType = "request" | "collection" | "testflow" | "folder";

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
  graphql_variables?: string;
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
  protocol?: Protocol;
  method: HttpMethod;
  url: string;
  isDirty: boolean;
  savedRequestId?: string;
  collectionId?: string;
  collectionItemId?: string;
  parentCollectionId?: string;
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
  // GraphQL-specific
  graphqlQuery?: string;
  graphqlVariables?: string;
  // WebSocket-specific (runtime only)
  wsMessages?: WebSocketMessage[];
  wsConnected?: boolean;
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

export type PanelId = "requestBuilder" | "scriptEditor" | "responsePanel";

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

// ── Test Flow Types ──

export type TestFlowNodeType =
  | "http_request"
  | "collection"
  | "assertion"
  | "script"
  | "delay"
  | "condition"
  | "loop"
  | "set_variable"
  | "group"
  | "websocket"
  | "graphql";

export interface TestFlowNodeConfig {
  request_id?: string;
  request_name_hint?: string;
  inline_request?: {
    method: HttpMethod;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    body_type?: string;
    query_params?: Record<string, string>;
    auth_type?: AuthType;
    auth_config?: Record<string, string>;
  };
  collection_id?: string;
  collection_name_hint?: string;
  assertions?: {
    type: "status_code" | "body_contains" | "json_path" | "header_check" | "response_time";
    field?: string;
    operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains" | "not_contains" | "regex";
    expected: string;
  }[];
  script?: string;
  language?: "javascript" | "python";
  delay_ms?: number;
  expression?: string;
  mode?: "count" | "condition";
  count?: number;
  condition?: string;
  max_iterations?: number;
  assignments?: { key: string; value: string }[];
  // WebSocket node
  ws_url?: string;
  ws_message?: string;
  ws_timeout_ms?: number;
  ws_wait_response?: boolean;
  // GraphQL node
  graphql_url?: string;
  graphql_query?: string;
  graphql_variables?: string;
  headers?: Record<string, string>;
  color?: string;
  width?: number;
  height?: number;
}

export interface TestFlowNodeData {
  id: string;
  node_type: TestFlowNodeType;
  label: string;
  position_x: number;
  position_y: number;
  config: TestFlowNodeConfig;
  parent_node_id?: string | null;
}

export interface TestFlowEdgeData {
  id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle?: string | null;
  target_handle?: string | null;
  label?: string | null;
}

export interface TestFlow {
  id: string;
  name: string;
  description: string | null;
  workspace_id: string | null;
  viewport?: { x: number; y: number; zoom: number } | null;
  variables: Record<string, string> | null;
  nodes: TestFlowNodeData[];
  edges: TestFlowEdgeData[];
  created_at: string;
  updated_at: string;
}

export interface TestFlowSummary {
  id: string;
  name: string;
  description: string | null;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestFlowRunResult {
  id: string;
  node_id: string;
  node_type: string;
  node_label: string;
  execution_order: number;
  iteration: number;
  status: "success" | "error" | "skipped";
  error: string | null;
  elapsed_ms: number | null;
  status_code: number | null;
  response_body: string | null;
  response_headers: Record<string, string> | null;
  size_bytes: number | null;
  assertion_results: { name: string; passed: boolean; actual?: string | null; expected?: string; error: string | null }[] | null;
  console_logs: string[] | null;
  variables_snapshot: Record<string, string> | null;
  branch_taken: string | null;
}

export interface TestFlowRunSummary {
  id: string;
  flow_id: string;
  flow_name: string;
  environment_name: string | null;
  status: "completed" | "stopped" | "failed";
  total_nodes: number;
  passed_count: number;
  failed_count: number;
  skipped_count: number;
  total_assertions: number;
  passed_assertions: number;
  failed_assertions: number;
  total_time_ms: number;
  created_at: string;
  finished_at: string | null;
}

export interface TestFlowRunDetail extends TestFlowRunSummary {
  final_variables: Record<string, string> | null;
  results: TestFlowRunResult[];
}
