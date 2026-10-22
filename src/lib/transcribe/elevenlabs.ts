// ElevenLabs Speech-to-Text (D395): the stored file by URL, word timestamps, language detected.
import { ELEVENLABS_API_BASE } from "@/lib/elevenlabs/constants";
import { TRANSCRIBE_ENGINE } from "./providers";
import type { TranscribeFailureReason, TranscriptWord } from "./types";

/** answered: the engine replied (and may have billed), so it is never tried again (rule 12). */
export class TranscribeError extends Error {
  constructor(public readonly reason: TranscribeFailureReason, public readonly answered: boolean, detail: string) {
    super(detail);
    this.name = "TranscribeError";
  }
}

type ScribeWord = { text: string; start: number | null; end: number | null; type: string; logprob?: number };

export function parseScribeResponse(json: unknown): { language: string; words: TranscriptWord[] } {
  const body = json as { language_code?: string; words?: ScribeWord[] };
  const words = (body.words ?? [])
    .filter((w) => w.type === "word" && typeof w.start === "number" && typeof w.end === "number" && w.text.trim())
    .map((w) => ({ t: w.text.trim(), s: w.start!, e: w.end!, p: Math.round(Math.exp(w.logprob ?? 0) * 1000) / 1000 }));
  return { language: body.language_code ?? "und", words };
}

export async function transcribeUrl(url: string, deps: { fetch: typeof fetch; apiKey: string }): Promise<{ language: string; words: TranscriptWord[] }> {
  const form = new FormData();
  form.set("model_id", TRANSCRIBE_ENGINE.model);
  form.set("source_url", url);
  form.set("timestamps_granularity", "word");
  form.set("tag_audio_events", "false");
  let res: Response;
  try {
    res = await deps.fetch(`${ELEVENLABS_API_BASE}/v1/speech-to-text`, { method: "POST", headers: { "xi-api-key": deps.apiKey }, body: form });
  } catch (e) {
    throw new TranscribeError("failed", false, `network: ${e instanceof Error ? e.message : String(e)}`);
  }
  const text = await res.text();
  if (!res.ok) throw new TranscribeError("failed", true, `${res.status}: ${text.slice(0, 300)}`);
  let parsed: { language: string; words: TranscriptWord[] };
  try {
    parsed = parseScribeResponse(JSON.parse(text));
  } catch {
    throw new TranscribeError("failed", true, `unreadable response: ${text.slice(0, 200)}`);
  }
  if (parsed.words.length === 0) throw new TranscribeError("no-speech", true, "no words");
  return parsed;
}
