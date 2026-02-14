import { useState, useCallback } from "react";
import { proxyApi } from "@/api/endpoints";
import type { ProxyResponse, HttpMethod, AuthType } from "@/types";

interface SendOptions {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  query_params?: Record<string, string>;
  auth_type?: AuthType;
  auth_config?: Record<string, string>;
  environment_id?: string;
}

export function useProxy() {
  const [response, setResponse] = useState<ProxyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (options: SendOptions) => {
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const { data } = await proxyApi.send(options);
      setResponse(data);
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Request failed";
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { response, loading, error, send };
}
