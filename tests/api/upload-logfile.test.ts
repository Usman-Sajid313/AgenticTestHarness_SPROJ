import { describe, it, expect } from 'vitest';
import {
  apiPostFormData,
  signupAndGetCookie,
  createProject,
  uniqueName,
} from '../helpers/api';

function uniqueEmail() {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}

function makeFormData(overrides: { file?: Blob | null; filename?: string; projectId?: string | null; mappingConfig?: string } = {}) {
  const form = new FormData();
  const file = overrides.file ?? new Blob(['{"step":1}\n'], { type: 'application/jsonl' });
  const filename = overrides.filename ?? 'run.jsonl';
  const projectId = overrides.projectId ?? 'missing';
  if (file) form.append('file', file, filename);
  form.append('projectId', projectId);
  if (overrides.mappingConfig !== undefined) form.append('mappingConfig', overrides.mappingConfig);
  return form;
}

describe('Use case: Upload agent log file', () => {
  it('Variation 1 (Happy path): with auth, valid file and projectId returns 200 and runId', async () => {
    const { cookie } = await signupAndGetCookie(uniqueName('UploadUser'), uniqueEmail(), 'Test123!@#');
    expect(cookie).toBeTruthy();
    const projectRes = await createProject(cookie!, 'Upload Project', 'Desc');
    expect(projectRes.status).toBe(200);
    const project = await projectRes.json();
    const form = makeFormData({ projectId: project.id });
    const res = await apiPostFormData('/api/runs/upload-logfile', form, { cookie: cookie! });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.runId).toBeDefined();
    expect(data.status).toBe('UPLOADED');
  });

  it('Variation 2 (Invalid): missing file returns 400', async () => {
    const { cookie } = await signupAndGetCookie(uniqueName('UploadUser2'), uniqueEmail(), 'Test123!@#');
    const projectRes = await createProject(cookie!, 'P2', 'Desc');
    const project = await projectRes.json();
    const form = new FormData();
    form.append('projectId', project.id);
    const res = await apiPostFormData('/api/runs/upload-logfile', form, { cookie: cookie! });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing file or projectId');
  });

  it('Variation 3 (Auth): no cookie returns 401', async () => {
    const { cookie } = await signupAndGetCookie(uniqueName('UploadUser3'), uniqueEmail(), 'Test123!@#');
    const projectRes = await createProject(cookie!, 'P3', 'Desc');
    const project = await projectRes.json();
    const form = makeFormData({ projectId: project.id });
    const res = await apiPostFormData('/api/runs/upload-logfile', form);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('Variation 4 (Invalid): missing projectId returns 400', async () => {
    const { cookie } = await signupAndGetCookie(uniqueName('UploadUser4'), uniqueEmail(), 'Test123!@#');
    const form = makeFormData({ projectId: '' });
    const res = await apiPostFormData('/api/runs/upload-logfile', form, { cookie: cookie! });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing file or projectId');
  });

  it('Variation 5 (Invalid): invalid mappingConfig JSON returns 400', async () => {
    const { cookie } = await signupAndGetCookie(uniqueName('UploadUser5'), uniqueEmail(), 'Test123!@#');
    const projectRes = await createProject(cookie!, 'P5', 'Desc');
    const project = await projectRes.json();
    const form = makeFormData({ projectId: project.id });
    form.append('mappingConfig', 'not valid json');
    const res = await apiPostFormData('/api/runs/upload-logfile', form, { cookie: cookie! });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid mappingConfig JSON');
  });
});
