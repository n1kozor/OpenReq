import type { GQLSchema, GQLTypeRef, GQLType } from "@/types";

export const INTROSPECTION_QUERY = `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind name description
      fields(includeDeprecated: true) {
        name description isDeprecated
        args { name description defaultValue type { ...TypeRef } }
        type { ...TypeRef }
      }
      inputFields { name description defaultValue type { ...TypeRef } }
      enumValues(includeDeprecated: true) { name description isDeprecated }
      possibleTypes { name }
    }
  }
}
fragment TypeRef on __Type {
  kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
}`;

function typeRefToString(ref: GQLTypeRef): string {
  if (!ref) return "unknown";
  if (ref.kind === "NON_NULL") return `${typeRefToString(ref.ofType!)}!`;
  if (ref.kind === "LIST") return `[${typeRefToString(ref.ofType!)}]`;
  return ref.name || "unknown";
}

export function parseIntrospectionResult(raw: Record<string, unknown>): GQLSchema {
  const s = raw as {
    queryType: { name: string } | null;
    mutationType: { name: string } | null;
    subscriptionType: { name: string } | null;
    types: Array<{
      kind: string; name: string; description: string | null;
      fields: Array<{ name: string; description: string | null; isDeprecated: boolean; args: Array<{ name: string; description: string | null; defaultValue: string | null; type: GQLTypeRef }>; type: GQLTypeRef }> | null;
      inputFields: Array<{ name: string; description: string | null; defaultValue: string | null; type: GQLTypeRef }> | null;
      enumValues: Array<{ name: string; description: string | null; isDeprecated: boolean }> | null;
      possibleTypes: Array<{ name: string }> | null;
    }>;
  };

  const types: Record<string, GQLType> = {};
  for (const t of s.types) {
    if (t.name.startsWith("__")) continue;
    types[t.name] = {
      kind: t.kind,
      name: t.name,
      description: t.description,
      fields: (t.fields ?? []).map((f) => ({
        name: f.name,
        description: f.description,
        type: typeRefToString(f.type),
        typeRef: f.type,
        args: (f.args ?? []).map((a) => ({
          name: a.name,
          description: a.description,
          type: typeRefToString(a.type),
          defaultValue: a.defaultValue,
        })),
        isDeprecated: f.isDeprecated,
      })),
      inputFields: (t.inputFields ?? []).map((f) => ({
        name: f.name,
        description: f.description,
        type: typeRefToString(f.type),
        defaultValue: f.defaultValue,
      })),
      enumValues: (t.enumValues ?? []).map((e) => ({ name: e.name, description: e.description })),
      possibleTypes: (t.possibleTypes ?? []).map((p) => p.name),
    };
  }

  return {
    queryType: s.queryType?.name ?? null,
    mutationType: s.mutationType?.name ?? null,
    subscriptionType: s.subscriptionType?.name ?? null,
    types,
  };
}
