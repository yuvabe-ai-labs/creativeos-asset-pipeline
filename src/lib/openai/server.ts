import "server-only";
import OpenAI from "openai";

// Server-only OpenAI client. The key never reaches the browser (this file
// carries `import "server-only"`, like the Supabase service client).
export function createOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in .env.local");
  }
  return new OpenAI({ apiKey });
}
