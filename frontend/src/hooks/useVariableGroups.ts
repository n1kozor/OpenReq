import { useMemo } from "react";
import type { EnvironmentVariable } from "@/types";

export interface VariableInfo {
  key: string;
  value: string;
  source: "globals" | "collection" | "environment";
}

export interface VariableGroup {
  source: "globals" | "collection" | "environment";
  label: string;
  items: VariableInfo[];
}

interface UseVariableGroupsResult {
  groups: VariableGroup[];
  resolved: Map<string, VariableInfo>;
}

export function useVariableGroups(
  envVariables: EnvironmentVariable[],
  collectionVariables: Record<string, string>,
  globalsVariables?: Record<string, string> | null,
): UseVariableGroupsResult {
  return useMemo(() => {
    const groups: VariableGroup[] = [];
    const resolved = new Map<string, VariableInfo>();

    // Globals first (lowest priority — everything overrides)
    const globalsItems: VariableInfo[] = [];
    if (globalsVariables) {
      for (const [key, value] of Object.entries(globalsVariables)) {
        const info: VariableInfo = { key, value, source: "globals" };
        globalsItems.push(info);
        resolved.set(key, info);
      }
    }
    if (globalsItems.length > 0) {
      groups.push({ source: "globals", label: "variable.globals", items: globalsItems });
    }

    // Collection variables (override globals)
    const colItems: VariableInfo[] = [];
    for (const [key, value] of Object.entries(collectionVariables)) {
      const info: VariableInfo = { key, value, source: "collection" };
      colItems.push(info);
      resolved.set(key, info);
    }
    if (colItems.length > 0) {
      groups.push({ source: "collection", label: "variable.collection", items: colItems });
    }

    // Environment variables (highest priority — override everything)
    const envItems: VariableInfo[] = [];
    for (const v of envVariables) {
      const info: VariableInfo = { key: v.key, value: v.is_secret ? "******" : v.value, source: "environment" };
      envItems.push(info);
      resolved.set(v.key, info);
    }
    if (envItems.length > 0) {
      groups.push({ source: "environment", label: "variable.environment", items: envItems });
    }

    return { groups, resolved };
  }, [envVariables, collectionVariables, globalsVariables]);
}
