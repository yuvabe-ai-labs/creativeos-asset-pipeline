import { createHmac, timingSafeEqual } from "node:crypto";

export type ImpersonationPayload = {
  operatorId: string;
  targetOrgId: string;
  elevated: boolean;
  expiresAt: string; // ISO 8601
};

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function isImpersonationPayload(value: unknown): value is ImpersonationPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.operatorId === "string" &&
    typeof v.targetOrgId === "string" &&
    typeof v.elevated === "boolean" &&
    typeof v.expiresAt === "string"
  );
}

// Cookie shape: base64url(JSON payload) + "." + hex(HMAC-SHA256 of that base64url string).
// No encryption — the payload isn't secret (an org id + operator id), only tamper-proof.
export function encodeImpersonationCookie(
  payload: ImpersonationPayload,
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

// Returns null (never throws) for any malformed, tampered, wrong-secret, or expired
// cookie — every failure mode collapses to "not impersonating," which is always the
// safe default. `now` is injected (not `new Date()` internally) so expiry is testable
// without faking the system clock.
export function decodeImpersonationCookie(
  cookieValue: string,
  secret: string,
  now: Date,
): ImpersonationPayload | null {
  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const expectedSignature = sign(body, secret);
  const sigBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isImpersonationPayload(parsed)) return null;
  if (new Date(parsed.expiresAt).getTime() < now.getTime()) return null;

  return parsed;
}
