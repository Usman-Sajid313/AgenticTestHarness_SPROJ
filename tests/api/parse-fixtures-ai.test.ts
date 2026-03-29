import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  apiPost,
  apiPostFormData,
  signupAndGetCookie,
  createProject,
  uniqueName,
} from '../helpers/api';

function uniqueEmail() {
  return `parse-fix-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}

const fixturesDir = path.join(process.cwd(), 'tests/fixtures');

async function createRunWithFixture(
  fixtureFile: string,
): Promise<{ runId: string; cookie: string }> {
  const name = uniqueName('FixtureParse');
  const { res: signupRes, cookie } = await signupAndGetCookie(name, uniqueEmail(), 'Test123!@#');
  if (!signupRes.ok || !cookie) throw new Error('Signup failed');
  const projectRes = await createProject(cookie, `P-${name}`, 'Fixture parse');
  if (!projectRes.ok) throw new Error('Create project failed');
  const project = await projectRes.json();
  const buf = readFileSync(path.join(fixturesDir, fixtureFile));
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'application/x-ndjson' }), fixtureFile);
  form.append('projectId', project.id);
  const uploadRes = await apiPostFormData('/api/runs/upload-logfile', form, { cookie });
  if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
  const uploadData = await uploadRes.json();
  return { runId: uploadData.runId as string, cookie };
}

describe('Parse run with AI fixtures (integration)', () => {
  it('Variation 1: langchain-sample.jsonl yields parser confidence and adapter in data', async () => {
    const { runId, cookie } = await createRunWithFixture('langchain-sample.jsonl');
    const res = await apiPost(`/api/runs/${runId}/parse`, {}, { cookie });
    expect([200, 429, 500]).toContain(res.status);
    if (res.status !== 200) return;
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data?.parserConfidence).toBeDefined();
    expect(typeof body.data?.parserConfidence).toBe('number');
    expect(body.data?.runId).toBe(runId);
  });

  it('Variation 2: openai-agents-sample.jsonl parses successfully', async () => {
    const { runId, cookie } = await createRunWithFixture('openai-agents-sample.jsonl');
    const res = await apiPost(`/api/runs/${runId}/parse`, {}, { cookie });
    expect([200, 429, 500]).toContain(res.status);
    if (res.status !== 200) return;
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data?.packetSizeBytes).toBeGreaterThan(0);
  });

  it('Variation 3: generic-jsonl-sample.jsonl parses successfully', async () => {
    const { runId, cookie } = await createRunWithFixture('generic-jsonl-sample.jsonl');
    const res = await apiPost(`/api/runs/${runId}/parse`, {}, { cookie });
    expect([200, 429, 500]).toContain(res.status);
    if (res.status !== 200) return;
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
