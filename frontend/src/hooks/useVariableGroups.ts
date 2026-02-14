import { useMemo } from "react";
import type { EnvironmentVariable } from "@/types";

export interface VariableInfo {
  key: string;
  value: string;
  source: "environment" | "collection";
}

export interface VariableGroup {
  source: "environment" | "collection";
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
): UseVariableGroupsResult {
  return useMemo(() => {
    const groups: VariableGroup[] = [];
    const resolved = new Map<string, VariableInfo>();

    // Collection variables first (lower priority — env overrides)
    const colItems: VariableInfo[] = [];
    for (const [key, value] of Object.entries(collectionVariables)) {
      const info: VariableInfo = { key, value, source: "collection" };
      colItems.push(info);
      resolved.set(key, info);
    }
    if (colItems.length > 0) {
      groups.push({ source: "collection", label: "variable.collection", items: colItems });
    }

    // Environment variables (higher priority — override collection)
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
  }, [envVariables, collectionVariables]);
}
