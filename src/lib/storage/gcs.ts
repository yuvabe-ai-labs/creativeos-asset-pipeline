import "server-only";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Storage } from "@google-cloud/storage";

let _storage: Storage | null = null;
let _bucketName: string | null = null;

function getStorage(): Storage {
  if (_storage) return _storage;

  const projectId = process.env.GCP_PROJECT_ID;
  const keyBase64 = process.env.GCP_SERVICE_ACCOUNT_KEY_BASE64;

  if (!projectId) {
    throw new Error("Missing GCP_PROJECT_ID env var.");
  }

  if (keyBase64) {
    const credentials = JSON.parse(
      Buffer.from(keyBase64, "base64").toString("utf8"),
    );
    _storage = new Storage({ projectId, credentials });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE) {
    // No key: the library finds credentials itself — the key file locally, or on Cloud Run
    // (which sets K_SERVICE) the service account the service runs as.
    _storage = new Storage({ projectId });
  } else {
    throw new Error(
      "Missing GCS credentials — set GCP_SERVICE_ACCOUNT_KEY_BASE64 or GOOGLE_APPLICATION_CREDENTIALS.",
    );
  }
  return _storage;
}

export function getBucketName(): string {
  if (_bucketName) return _bucketName;
  const name = process.env.GCS_BUCKET;
  if (!name) throw new Error("Missing GCS_BUCKET env var.");
  _bucketName = name;
  return name;
}

export function publicUrlFor(path: string): string {
  return `https://storage.googleapis.com/${getBucketName()}/${path}`;
}

export async function _put(
  path: string,
  body: Buffer,
  contentType: string,
  opts: { contentDisposition?: string } = {},
): Promise<void> {
  await getStorage().bucket(getBucketName()).file(path).save(body, {
    contentType,
    // A download name for files people save (the editor's package, D392).
    ...(opts.contentDisposition ? { metadata: { contentDisposition: opts.contentDisposition } } : {}),
  });
}

/**
 * Writes a stream to storage without holding the whole file in memory (D483). A single-request
 * upload, so a stream that fails part way leaves no object behind.
 */
export async function _putStream(path: string, body: Readable, contentType: string): Promise<void> {
  const file = getStorage().bucket(getBucketName()).file(path);
  await pipeline(body, file.createWriteStream({ contentType, resumable: false }));
}

// V4 signed URL authorizing a single direct browser → GCS upload (HTTP PUT).
// The browser sends the bytes straight to GCS, bypassing the Vercel Function's
// 4.5 MB request-body limit. The signature pins the exact path and Content-Type,
// so a client cannot upload elsewhere or with a different type; it expires fast.
export async function _signPutUrl(
  path: string,
  contentType: string,
  expiresMs = 5 * 60 * 1000,
): Promise<string> {
  const [url] = await getStorage()
    .bucket(getBucketName())
    .file(path)
    .getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + expiresMs,
      contentType,
    });
  return url;
}

// V4 signed URL that saves a stored file under `fileName` instead of playing it in the tab. A
// `download` attribute alone can't do this: browsers ignore it for another domain's file.
export async function _signDownloadUrl(
  path: string,
  fileName: string,
  expiresMs = 15 * 60 * 1000,
): Promise<string> {
  const [url] = await getStorage()
    .bucket(getBucketName())
    .file(path)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresMs,
      responseDisposition: `attachment; filename="${fileName}"`,
    });
  return url;
}

export async function _remove(path: string): Promise<void> {
  await getStorage()
    .bucket(getBucketName())
    .file(path)
    .delete({ ignoreNotFound: true });
}

export function _resetGcsClient(): void {
  _storage = null;
  _bucketName = null;
}
