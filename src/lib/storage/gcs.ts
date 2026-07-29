import "server-only";
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
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
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
): Promise<void> {
  await getStorage().bucket(getBucketName()).file(path).save(body, {
    contentType,
  });
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
