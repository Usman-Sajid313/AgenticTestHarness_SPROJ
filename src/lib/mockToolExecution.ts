import type { MockToolDefinition } from '@/lib/mockToolCatalog';

export async function executeMockTool(
  def: MockToolDefinition,
  origin: string,
  input: Record<string, unknown>,
): Promise<{ latency: number; data: unknown }> {
  const startedAt = Date.now();
  const url = new URL(def.path, origin);

  let response: Response;
  if (def.method === 'GET') {
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
    response = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
  } else {
    response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    });
  }

  const latency = Date.now() - startedAt;

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${text || 'Failed to call tool endpoint.'}`);
  }

  const json = await response.json();
  return {
    latency,
    data: json,
  };
}
