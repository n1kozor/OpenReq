/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// OpenReq extension / Electron local proxy globals
interface Window {
  __OPENREQ_EXTENSION__?: { version: string };
  electronAPI?: {
    testConnection?: (ip: string, port: string) => Promise<{ success: boolean; status?: number; error?: string }>;
    saveConfig?: (ip: string, port: string) => Promise<boolean>;
    getConfig?: () => Promise<{ ip: string; port: string }>;
    resetConfig?: () => Promise<boolean>;
    minimize?: () => void;
    maximize?: () => void;
    close?: () => void;
    localProxy?: (request: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body_type?: string | null;
      form_data?: { key: string; value: string; type: string; enabled: boolean; file_name?: string | null; file_content_base64?: string | null }[];
      body?: string | null;
      query_params?: Record<string, string>;
    }) => Promise<{
      status_code: number;
      headers: Record<string, string>;
      body: string;
      body_base64?: string | null;
      is_binary: boolean;
      content_type: string;
      elapsed_ms: number;
      size_bytes: number;
    }>;
  };
}
