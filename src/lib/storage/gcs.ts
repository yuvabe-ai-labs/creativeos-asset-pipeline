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
