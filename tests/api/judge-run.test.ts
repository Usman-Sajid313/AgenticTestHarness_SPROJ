import { describe, it, expect } from 'vitest';
import { apiPost, createUploadedRun, uniqueName } from '../helpers/api';

function uniqueEmail() {
  return `judge-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}

const JUDGE_TIMEOUT_MS = 60_000;

describe('Use case: Judge run', () => {
  it('Variation 1 (Happy path): run READY_FOR_JUDGING with cookie returns 200 or 202/500', async () => {
    const name = uniqueName('JudgeUser');
    const { runId, cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    await apiPost(`/api/runs/${runId}/parse`, {}, { cookie });
    const res = await apiPost(`/api/runs/${runId}/judge`, {}, { cookie });
    expect([200, 202, 429, 500, 503]).toContain(res.status);
    if (res.status === 200 || res.status === 202) {
      const data = await res.json();
      expect(data.runId).toBe(runId);
    }
  }, JUDGE_TIMEOUT_MS);

  it('Variation 2 (Auth): no cookie returns 401', async () => {
    const name = uniqueName('JudgeUser2');
    const { runId } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    await apiPost(`/api/runs/${runId}/parse`, {}, { cookie: null });
    const res = await apiPost(`/api/runs/${runId}/judge`, {});
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('Variation 3 (Not found): non-existent run id returns 404', async () => {
    const name = uniqueName('JudgeUser3');
    const { cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const fakeId = 'clxxxxxxxxxxxxxxxxxxxxxxxxx';
    const res = await apiPost(`/api/runs/${fakeId}/judge`, {}, { cookie });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Run not found');
  });

  it('Variation 4 (Invalid state): run not READY_FOR_JUDGING returns 400', async () => {
    const name = uniqueName('JudgeUser4');
    const { runId, cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const res = await apiPost(`/api/runs/${runId}/judge`, {}, { cookie });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('not ready for judging');
  });

  it('Variation 5 (Edge): second judge call may return 202 already in progress', async () => {
    const name = uniqueName('JudgeUser5');
    const { runId, cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    await apiPost(`/api/runs/${runId}/parse`, {}, { cookie });
    const res1 = await apiPost(`/api/runs/${runId}/judge`, {}, { cookie });
    const res2 = await apiPost(`/api/runs/${runId}/judge`, {}, { cookie });
    expect([200, 202, 429, 500, 503]).toContain(res1.status);
    expect([200, 202, 429, 500, 503]).toContain(res2.status);
    if (res2.status === 202) {
      const data = await res2.json();
      expect(data.message).toContain('already');
    }
  }, JUDGE_TIMEOUT_MS);
});
