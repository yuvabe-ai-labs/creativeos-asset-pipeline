import "server-only";
import { GoogleGenAI } from "@google/genai";

export function createGemini(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_GENAI_API_KEY in .env");
  return new GoogleGenAI({ apiKey });
}
