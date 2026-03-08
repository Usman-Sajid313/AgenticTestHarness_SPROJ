import * as fs from "fs/promises";
import * as path from "path";

const DEFAULT_UPLOADS_DIR = path.join(process.cwd(), "uploads");

function getUploadsBaseDir(): string {
  return process.env.UPLOADS_DIR || DEFAULT_UPLOADS_DIR;
}

function resolveStoragePath(bucket: string, storageKey: string): string {
  // Prevent path traversal
  const sanitizedKey = storageKey.replace(/\.\./g, "").replace(/^\//, "");
  return path.join(getUploadsBaseDir(), bucket, sanitizedKey);
}

export async function uploadFile(
  storageKey: string,
  data: Buffer | ArrayBuffer | Uint8Array,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _contentType?: string
): Promise<void> {
  const filePath = resolveStoragePath("agent-logs", storageKey);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const buffer = Buffer.isBuffer(data)
    ? data
    : Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
  await fs.writeFile(filePath, buffer);
}

export async function downloadFile(storageKey: string): Promise<Buffer> {
  const filePath = resolveStoragePath("agent-logs", storageKey);
  return fs.readFile(filePath);
}

export function getPublicUrl(storageKey: string): string {
  const sanitizedKey = storageKey.replace(/\.\./g, "").replace(/^\//, "");
  return `/api/files/agent-logs/${sanitizedKey}`;
}

export function getUploadsDir(): string {
  return getUploadsBaseDir();
}
