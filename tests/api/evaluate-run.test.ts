import { describe, it, expect } from 'vitest';
import { apiPost, createUploadedRun, uniqueName } from '../helpers/api';

function uniqueEmail() {
  return `eval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}

const EVALUATE_TIMEOUT_MS = 60_000;

describe('Use case: Evaluate run', () => {
  it('Variation 1 (Happy path): run UPLOADED with cookie returns 200 completed or 500', async () => {
    const name = uniqueName('EvalUser');
    const { runId, cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const res = await apiPost(`/api/runs/${runId}/evaluate`, {}, { cookie });
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(['completed', 'failed', 'already-processing']).toContain(data.status);
    }
  }, EVALUATE_TIMEOUT_MS);

  it('Variation 2 (Auth): no cookie returns 401', async () => {
    const name = uniqueName('EvalUser2');
    const { runId } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const res = await apiPost(`/api/runs/${runId}/evaluate`, {});
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('Variation 3 (Not found): non-existent run id returns 404', async () => {
    const name = uniqueName('EvalUser3');
    const { cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const fakeId = 'clxxxxxxxxxxxxxxxxxxxxxxxxx';
    const res = await apiPost(`/api/runs/${fakeId}/evaluate`, {}, { cookie });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Run not found');
  });

  it('Variation 4 (Edge): second evaluate reflects provider availability and prior run state', async () => {
    const name = uniqueName('EvalUser4');
    const { runId, cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const res1 = await apiPost(`/api/runs/${runId}/evaluate`, {}, { cookie });
    const res2 = await apiPost(`/api/runs/${runId}/evaluate`, {}, { cookie });
    expect([200, 500]).toContain(res1.status);
    expect([200, 500]).toContain(res2.status);
    const data2 = await res2.json();
    if (res1.status === 200) {
      expect(res2.status).toBe(200);
      expect(data2.status).toBe('already-processing');
    } else {
      expect(res2.status).toBe(500);
      expect(data2.status).toBe('failed');
    }
  }, EVALUATE_TIMEOUT_MS);

  it('Variation 5 (Edge): repeated evaluate only short-circuits after a successful prior evaluation', async () => {
    const name = uniqueName('EvalUser5');
    const { runId, cookie } = await createUploadedRun(name, uniqueEmail(), 'Test123!@#');
    const res1 = await apiPost(`/api/runs/${runId}/evaluate`, {}, { cookie });
    const res = await apiPost(`/api/runs/${runId}/evaluate`, {}, { cookie });
    expect([200, 500]).toContain(res1.status);
    expect([200, 500]).toContain(res.status);
    const data = await res.json();
    if (res1.status === 200) {
      expect(res.status).toBe(200);
      expect(data.status).toBe('already-processing');
    } else {
      expect(res.status).toBe(500);
      expect(data.status).toBe('failed');
    }
  }, EVALUATE_TIMEOUT_MS);
});
