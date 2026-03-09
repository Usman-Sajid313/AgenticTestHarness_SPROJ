export const API_TOKEN_SCOPE_VALUES = ["read", "write"] as const;

export type ApiTokenScope = (typeof API_TOKEN_SCOPE_VALUES)[number];

export const DEFAULT_API_TOKEN_SCOPES: ApiTokenScope[] = ["read"];

export function sanitizeApiTokenScopes(scopes: readonly string[]): ApiTokenScope[] {
  const normalized = new Set<ApiTokenScope>();

  for (const scope of scopes) {
    if (scope === "read" || scope === "write") {
      normalized.add(scope);
    }
  }

  return Array.from(normalized);
}
