import "server-only";
import { randomBytes } from "node:crypto";

// D307: the token IS the capability. 32 CSPRNG bytes → 43 base64url chars.
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

// Cheap shape check so a mangled link never reaches the database.
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
