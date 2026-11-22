// D534 — image prices live in ai_model_prices; this file keeps the OpenAI size mapping.

// ── Aspect ratio → pixel size mapping ────────────────────────────────────────
//
// Lives here (not in providers/openai.ts, where it originally lived) because it must stay
// importable from client components: the image focus view needs it client-side, and
// providers/openai.ts pulls in sharp + the OpenAI SDK — neither is safe to bundle client-side.
// providers/openai.ts still uses this for real generation; it imports it from here.

const ASPECT_RATIO_TO_OPENAI_SIZE: Record<string, string> = {
  "1:1":  "1024x1024",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
  "4:3":  "1536x1024",
  "3:4":  "1024x1536",
  "21:9": "1536x1024",
  "4:1":  "1536x1024",
  "1:4":  "1024x1536",
};

export function aspectRatioToOpenAISize(ratio: string): string {
  return ASPECT_RATIO_TO_OPENAI_SIZE[ratio] ?? "1024x1024";
}
