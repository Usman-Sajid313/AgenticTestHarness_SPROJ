export function baseUrl(): string {
  return process.env.TEST_BASE_URL ?? 'http://localhost:3000';
}

/** Returns a unique display name to avoid Workspace.name unique constraint on signup. */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Extract auth cookie from response (Set-Cookie header). */
export function getAuthCookieFromResponse(res: Response): string | null {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  const first = setCookie.split(';').shift()?.trim() ?? null;
  return first || null;
}

export async function apiPost(
  path: string,
  body: Record<string, unknown> | null,
  options: { cookie?: string | null } = {}
): Promise<Response> {
  const url = `${baseUrl()}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.cookie) headers['Cookie'] = options.cookie;
  return fetch(url, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiPostFormData(
  path: string,
  formData: FormData,
  options: { cookie?: string | null } = {}
): Promise<Response> {
  const url = `${baseUrl()}${path}`;
  const headers: Record<string, string> = {};
  if (options.cookie) headers['Cookie'] = options.cookie;
  return fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });
}

export async function apiGet(path: string, options: { cookie?: string | null } = {}): Promise<Response> {
  const url = `${baseUrl()}${path}`;
  const headers: Record<string, string> = {};
  if (options.cookie) headers['Cookie'] = options.cookie;
  return fetch(url, { method: 'GET', headers });
}

/** Signup and return auth cookie on success. */
export async function signupAndGetCookie(
  name: string,
  email: string,
  password: string
): Promise<{ res: Response; cookie: string | null }> {
  const res = await apiPost('/api/auth/signup', { name, email, password });
  const cookie = getAuthCookieFromResponse(res);
  return { res, cookie };
}

/** Login and return auth cookie on success. */
export async function loginAndGetCookie(
  identifier: string,
  password: string
): Promise<{ res: Response; cookie: string | null }> {
  const res = await apiPost('/api/auth/login', { identifier, password });
  const cookie = getAuthCookieFromResponse(res);
  return { res, cookie };
}

/** Create a project; requires auth. */
export async function createProject(
  cookie: string,
  name: string,
  description: string
): Promise<Response> {
  return apiPost('/api/projects', { name, description }, { cookie });
}

/** Create a run with no logfile (status PENDING). Returns run id. */
export async function createRunNoLogfile(
  cookie: string,
  projectId: string
): Promise<{ res: Response; runId: string | null }> {
  const res = await apiPost('/api/runs', { projectId }, { cookie });
  const data = res.ok ? await res.json() : null;
  return { res, runId: data?.id ?? null };
}

/** Create user, project, upload one logfile. Returns runId, cookie, projectId. Run status is UPLOADED. */
export async function createUploadedRun(
  name: string,
  email: string,
  password: string
): Promise<{ runId: string; cookie: string; projectId: string }> {
  const { res: signupRes, cookie } = await signupAndGetCookie(name, email, password);
  if (!signupRes.ok || !cookie) throw new Error('Signup failed');
  const projectRes = await createProject(cookie, `P-${name}`, 'Desc');
  if (!projectRes.ok) throw new Error('Create project failed');
  const project = await projectRes.json();
  const form = new FormData();
  form.append('file', new Blob(['{"step":1}\n'], { type: 'application/json' }), 'run.jsonl');
  form.append('projectId', project.id);
  const uploadRes = await apiPostFormData('/api/runs/upload-logfile', form, { cookie });
  if (!uploadRes.ok) throw new Error('Upload failed');
  const uploadData = await uploadRes.json();
  return { runId: uploadData.runId, cookie, projectId: project.id };
}
