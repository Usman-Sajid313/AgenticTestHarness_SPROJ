'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { DEFAULT_API_TOKEN_SCOPES, type ApiTokenScope } from '@/lib/apiTokenScopes';

type ApiToken = {
  id: string;
  name: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Never';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function ApiTokensCard() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<ApiTokenScope[]>(DEFAULT_API_TOKEN_SCOPES);
  const [error, setError] = useState<string | null>(null);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch('/api/account/tokens', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { tokens: ApiToken[] };
      setTokens(data.tokens);
    } catch {
      // silently fail on initial load
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await fetchTokens();
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [fetchTokens]);

  async function onCreateToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;

    const trimmed = newTokenName.trim();
    if (!trimmed) {
      setError('Token name must not be empty.');
      return;
    }
    if (selectedScopes.length === 0) {
      setError('Select at least one scope.');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/account/tokens', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, scopes: selectedScopes }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data?.error ?? 'Failed to create token.');
        return;
      }

      const data = (await res.json()) as {
        ok: true;
        token: { id: string; name: string; scopes: string[]; createdAt: string; plaintext: string };
      };

      setTokens((prev) => [
        ...prev,
        {
          id: data.token.id,
          name: data.token.name,
          scopes: data.token.scopes,
          createdAt: data.token.createdAt,
          lastUsedAt: null,
          revokedAt: null,
        },
      ]);
      setNewlyCreatedToken(data.token.plaintext);
      setNewTokenName('');
      setSelectedScopes(DEFAULT_API_TOKEN_SCOPES);
      setCopied(false);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  async function onRevokeToken(id: string) {
    if (revokingId) return;

    setRevokingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/account/tokens/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data?.error ?? 'Failed to revoke token.');
        return;
      }

      await fetchTokens();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setRevokingId(null);
    }
  }

  async function onCopyToken() {
    if (!newlyCreatedToken) return;
    try {
      await navigator.clipboard.writeText(newlyCreatedToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API may not be available
    }
  }

  function toggleScope(scope: ApiTokenScope) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((value) => value !== scope) : [...prev, scope]
    );
  }

  function formatScopes(scopes: string[]): string {
    if (scopes.length === 0) return 'None';
    return scopes
      .map((scope) => (scope === 'write' ? 'Write' : 'Read'))
      .join(', ');
  }

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-zinc-100">API Tokens</h3>
      </div>

      <p className="mb-6 text-sm text-zinc-400">
        Create and manage API tokens for programmatic access.
      </p>

      {/* Token reveal section */}
      {newlyCreatedToken && (
        <div className="mb-6 bg-emerald-950/50 border border-emerald-800 rounded-lg p-4">
          <p className="mb-2 text-sm font-medium text-emerald-400">
            Token created successfully
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm bg-zinc-950 rounded px-3 py-2 text-zinc-100 select-all break-all">
              {newlyCreatedToken}
            </code>
            <button
              type="button"
              onClick={onCopyToken}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Make sure to copy your token now. You won&apos;t be able to see it again!
          </p>
          <button
            type="button"
            onClick={() => {
              setNewlyCreatedToken(null);
              setCopied(false);
            }}
            className="mt-3 rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700"
          >
            Done
          </button>
        </div>
      )}

      {/* Create token form */}
      <form onSubmit={onCreateToken} className="mb-6 space-y-3">
        <div>
          <label htmlFor="token-name" className="block text-sm text-zinc-500">
            Token name
          </label>
          <input
            id="token-name"
            name="tokenName"
            type="text"
            value={newTokenName}
            onChange={(event) => {
              setNewTokenName(event.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. CI/CD pipeline"
            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
            disabled={loading || creating}
          />
        </div>
        <div>
          <p className="block text-sm text-zinc-500">Scopes</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={selectedScopes.includes('read')}
                onChange={() => toggleScope('read')}
                disabled={loading || creating}
              />
              Read
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={selectedScopes.includes('write')}
                onChange={() => toggleScope('write')}
                disabled={loading || creating}
              />
              Write
            </label>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Read tokens can fetch workspace data. Write tokens can create, update, and trigger runs.
          </p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || creating}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700 disabled:opacity-60"
        >
          {creating ? 'Creating...' : 'Create token'}
        </button>
      </form>

      {/* Token list */}
      {loading ? (
        <p className="text-sm text-zinc-500">Loading tokens...</p>
      ) : tokens.length === 0 ? (
        <p className="text-center text-sm text-zinc-400 py-8">
          No API tokens yet. Create one to enable programmatic access.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-zinc-500">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Created</th>
                <th className="pb-2 pr-4 font-medium">Last used</th>
                <th className="pb-2 pr-4 font-medium">Scopes</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => {
                const isRevoked = token.revokedAt !== null;
                return (
                  <tr key={token.id} className="border-b border-zinc-800/50">
                    <td className="py-3 pr-4 text-zinc-100">{token.name}</td>
                    <td className="py-3 pr-4 text-zinc-400">{formatDate(token.createdAt)}</td>
                    <td className="py-3 pr-4 text-zinc-400">{formatDate(token.lastUsedAt)}</td>
                    <td className="py-3 pr-4 text-zinc-400">{formatScopes(token.scopes)}</td>
                    <td className="py-3 pr-4">
                      {isRevoked ? (
                        <span className="text-red-400">Revoked</span>
                      ) : (
                        <span className="text-emerald-400">Active</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {!isRevoked && (
                        <button
                          type="button"
                          onClick={() => onRevokeToken(token.id)}
                          disabled={revokingId === token.id}
                          className="text-red-400 hover:text-red-300 text-sm disabled:opacity-60"
                        >
                          {revokingId === token.id ? 'Revoking...' : 'Revoke'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
