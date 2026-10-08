// Headers for downloading a finished video from its provider. Shared by completeGeneration and
// the video-generate task's voice branch (D282) — so no `server-only` here.
export function videoDownloadHeaders(modelUsed: string | null): Record<string, string> {
  const base = { "User-Agent": "Mozilla/5.0 (compatible; CreativeOS/1.0)" };
  // Veo and Gemini Omni both return a Google Files API URI that needs the API key to download.
  // Same key, same header — they are the same API.
  if (modelUsed?.startsWith("veo:") || modelUsed?.startsWith("gemini:")) {
    return { ...base, "x-goog-api-key": process.env.GOOGLE_GENAI_API_KEY ?? "" };
  }
  if (modelUsed?.startsWith("openai:")) {
    return { ...base, Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}` };
  }
  return base;
}
