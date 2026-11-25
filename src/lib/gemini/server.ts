import "server-only";
import { GoogleGenAI } from "@google/genai";

/** Enough of a key to tell which one it is (its ends and length), never enough to use it. */
export function keyFingerprint(key: string): string {
  if (key.length < 20) return `(${key.length} chars, too short to show)`;
  return `${key.slice(0, 8)}…${key.slice(-4)} (${key.length} chars)`;
}

let logged = false;

export function createGemini(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_GENAI_API_KEY in .env");
  // Once per server process: which key this server bills, to check against AI Studio's key list.
  if (!logged) {
    logged = true;
    console.info(`[gemini] using GOOGLE_GENAI_API_KEY ${keyFingerprint(apiKey)}`);
  }
  return new GoogleGenAI({ apiKey });
}
