// D282 — ElevenLabs HTTP client. No `server-only`: the Trigger tasks import this too.
import { CUSTOM_VOICE_CATEGORIES, ELEVENLABS_API_BASE, VOICE_CHANGE_MODEL_ID } from "./constants";

export type ElevenLabsVoice = {
  voiceId: string;
  name: string;
  category: string;
  previewUrl: string | null;
};

export class ElevenLabsKeyMissingError extends Error {
  constructor() {
    super("ELEVEN_LABS_API_KEY is not set");
    this.name = "ElevenLabsKeyMissingError";
  }
}

function apiKey(): string {
  const key = process.env.ELEVEN_LABS_API_KEY;
  if (!key) throw new ElevenLabsKeyMissingError();
  return key;
}

export function mapVoices(raw: unknown): ElevenLabsVoice[] {
  const list = (raw as { voices?: unknown } | null)?.voices;
  if (!Array.isArray(list)) return [];
  const voices: ElevenLabsVoice[] = [];
  for (const row of list) {
    const r = row as Record<string, unknown> | null;
    if (!r || typeof r.voice_id !== "string" || typeof r.name !== "string") continue;
    voices.push({
      voiceId: r.voice_id,
      name: r.name,
      category: typeof r.category === "string" ? r.category : "premade",
      previewUrl: typeof r.preview_url === "string" ? r.preview_url : null,
    });
  }
  const rank = (v: ElevenLabsVoice) => (CUSTOM_VOICE_CATEGORIES.has(v.category) ? 0 : 1);
  return voices.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export async function listVoices(fetchImpl: typeof fetch = fetch): Promise<ElevenLabsVoice[]> {
  const res = await fetchImpl(`${ELEVENLABS_API_BASE}/v1/voices`, {
    headers: { "xi-api-key": apiKey() },
  });
  if (!res.ok) throw new Error(`ElevenLabs voices request failed: ${res.status}`);
  return mapVoices(await res.json());
}

export async function speechToSpeech(
  args: { audio: Buffer; voiceId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(args.audio)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model_id", VOICE_CHANGE_MODEL_ID);
  const res = await fetchImpl(
    `${ELEVENLABS_API_BASE}/v1/speech-to-speech/${encodeURIComponent(args.voiceId)}`,
    { method: "POST", headers: { "xi-api-key": apiKey() }, body: form },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs speech-to-speech failed: ${res.status} ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
