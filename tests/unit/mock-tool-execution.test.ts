import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeMockTool } from '@/lib/mockToolExecution';
import { getMockToolById } from '@/lib/mockToolCatalog';

describe('executeMockTool', () => {
  const origin = 'http://localhost:3000';

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo) => {
        const u = typeof input === 'string' ? input : input.toString();
        if (u.includes('/api/mock/flights')) {
          return new Response(
            JSON.stringify({ ok: true, query: { origin: 'SFO', destination: 'NRT' }, flights: [] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (u.includes('/api/mock/budget')) {
          return new Response(JSON.stringify({ estimate: { totalUSD: 100 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET tool: builds query string and returns JSON body', async () => {
    const def = getMockToolById('mock-flight-search');
    if (!def) throw new Error('missing tool');
    const { data, latency } = await executeMockTool(def, origin, {
      origin: 'SFO',
      destination: 'NRT',
      date: '2025-11-14',
    });
    expect(latency).toBeGreaterThanOrEqual(0);
    expect(data).toMatchObject({ ok: true });
    expect(vi.mocked(fetch)).toHaveBeenCalled();
    const calledUrl = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(calledUrl).toContain('origin=SFO');
    expect(calledUrl).toContain('destination=NRT');
  });

  it('POST tool: sends JSON body', async () => {
    const def = getMockToolById('mock-budget-estimator');
    if (!def) throw new Error('missing tool');
    const { data } = await executeMockTool(def, origin, {
      city: 'Tokyo',
      travelers: 2,
      nights: 3,
    });
    expect(data).toEqual({ estimate: { totalUSD: 100 } });
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init?.method).toBe('POST');
    expect(init?.body).toContain('Tokyo');
  });

  it('throws on non-OK HTTP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('err', { status: 500 })),
    );
    const def = getMockToolById('mock-flight-search');
    if (!def) throw new Error('missing tool');
    await expect(
      executeMockTool(def, origin, { origin: 'SFO', destination: 'NRT' }),
    ).rejects.toThrow('HTTP 500');
  });
});
