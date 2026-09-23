import "server-only";
// BytePlus signature V4 for the Vision AI service (cv.byteplusapi.com), which OmniHuman uses.
// This is NOT the ModelArk bearer-key style: Seedream/Seedance take `Authorization: Bearer <key>`,
// while every Vision AI call must be signed with an Access Key pair.
//
// Steps and formats per docs.byteplus.com/en/docs/byteplus-platform/reference-how-to-calculate-a-signature:
//   CanonicalRequest = METHOD \n URI \n QueryString \n CanonicalHeaders \n SignedHeaders \n hash(body)
//   StringToSign     = "HMAC-SHA256" \n X-Date \n {YYYYMMDD}/{region}/{service}/request \n hash(CanonicalRequest)
//   kSigning         = HMAC(HMAC(HMAC(HMAC(secret, YYYYMMDD), region), service), "request")
import { createHash, createHmac } from "node:crypto";

export const CV_HOST = "cv.byteplusapi.com";
export const CV_REGION = "ap-singapore-1";
export const CV_SERVICE = "cv";

const sha256Hex = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const hmac = (key: Buffer | string, value: string) =>
  createHmac("sha256", key).update(value, "utf8").digest();

/** `20260923T104027Z` — UTC, no punctuation. */
export function xDate(now = new Date()): string {
  return `${now.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

export type SignedRequest = { url: string; headers: Record<string, string> };

export function signRequest(args: {
  accessKeyId: string;
  secretAccessKey: string;
  action: string;
  version: string;
  body: string;
  date?: string;
}): SignedRequest {
  const date = args.date ?? xDate();
  const shortDate = date.slice(0, 8);
  // Query params are signed in ASCII order, so Action comes before Version.
  const query = `Action=${encodeURIComponent(args.action)}&Version=${encodeURIComponent(args.version)}`;
  const payloadHash = sha256Hex(args.body);

  // Header names lowercase and ASCII-sorted; every line ends with \n.
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: CV_HOST,
    "x-content-sha256": payloadHash,
    "x-date": date,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join("");

  const canonicalRequest = [
    "POST",
    "/",
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${shortDate}/${CV_REGION}/${CV_SERVICE}/request`;
  const stringToSign = ["HMAC-SHA256", date, scope, sha256Hex(canonicalRequest)].join("\n");

  const kSigning = hmac(
    hmac(hmac(hmac(args.secretAccessKey, shortDate), CV_REGION), CV_SERVICE),
    "request",
  );
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return {
    url: `https://${CV_HOST}/?${query}`,
    headers: {
      "Content-Type": "application/json",
      "X-Date": date,
      "X-Content-Sha256": payloadHash,
      Authorization:
        `HMAC-SHA256 Credential=${args.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

/** Both names accepted: the product uses BYTEPLUS_*, the earlier experiment used BYTE_PLUS_*. */
export function accessKeys(): { accessKeyId: string; secretAccessKey: string } {
  const accessKeyId = process.env.BYTEPLUS_ACCESS_KEY_ID ?? process.env.BYTE_PLUS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.BYTEPLUS_SECRET_ACCESS_KEY ?? process.env.BYTE_PLUS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "OmniHuman needs BYTEPLUS_ACCESS_KEY_ID and BYTEPLUS_SECRET_ACCESS_KEY (Vision AI is " +
        "signed with an Access Key pair, not the ModelArk API key)",
    );
  }
  return { accessKeyId: accessKeyId.trim(), secretAccessKey: secretAccessKey.trim() };
}
