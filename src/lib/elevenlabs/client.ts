// D282 — ElevenLabs HTTP client. No `server-only`: the Trigger tasks import this too.
import { ELEVENLABS_API_BASE, VOICE_CHANGE_MODEL_ID } from "./constants";

export class ElevenLabsKeyMissingError extends Error {
  constructor() {
    super("ELEVEN_LABS_API_KEY is not set");
    this.name = "ElevenLabsKeyMissingError";
  }
}

// Carries the HTTP status so callers can classify retryable (429, 5xx) vs not (other 4xx).
export class ElevenLabsHttpError extends Error {
  readonly status: number;
  constructor(status: number, detail: string, what = "speech-to-speech") {
    super(`ElevenLabs ${what} failed: ${status} ${detail.slice(0, 300)}`);
    this.name = "ElevenLabsHttpError";
    this.status = status;
  }
}

export function elevenLabsKey(): string {
  const key = process.env.ELEVEN_LABS_API_KEY;
  if (!key) throw new ElevenLabsKeyMissingError();
  return key;
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
    { method: "POST", headers: { "xi-api-key": elevenLabsKey() }, body: form },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ElevenLabsHttpError(res.status, detail);
  }
  return Buffer.from(await res.arrayBuffer());
}
