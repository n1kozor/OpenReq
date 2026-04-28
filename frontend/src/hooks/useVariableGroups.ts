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
    // Precedence (later writes win in the resolved Map):
    //   globals < collection (incl. folder chain, merged upstream) < environment
    // Matches the backend's merged_vars order in proxy.py.
    const groups: VariableGroup[] = [];
    const resolved = new Map<string, VariableInfo>();

    // 1) Globals — lowest precedence; written first so collection/env can overwrite.
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

    // 2) Collection scope — collection vars + folder chain (folder wins) merged
    //    by the caller; overwrites globals.
    const colItems: VariableInfo[] = [];
    for (const [key, value] of Object.entries(collectionVariables)) {
      const info: VariableInfo = { key, value, source: "collection" };
      colItems.push(info);
      resolved.set(key, info);
    }
    if (colItems.length > 0) {
      groups.push({ source: "collection", label: "variable.collection", items: colItems });
    }

    // 3) Environment — highest precedence; overwrites globals and collection.
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
