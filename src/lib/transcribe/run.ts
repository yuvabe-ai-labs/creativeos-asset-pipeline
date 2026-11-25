// The editor-transcribe task's body (D411), with its I/O injected so tests drive it. Files run
// three at a time; each transcript is saved as soon as it lands, so the editor fills that clip
// while the others are still being listened to. A call the engine answered is never repeated
// (rule 12); only a network error before any answer is tried once more.
import type { TranscribeFile, TranscribeJobInput, TranscribeJobResult } from "@/lib/editor/transcribe-plan";
import { TranscribeError } from "./elevenlabs";
import { TRANSCRIBE_ENGINE } from "./providers";
import type { Transcript, TranscriptWord } from "./types";

const CONCURRENCY = 3;

type Deps = {
  transcribe(url: string): Promise<{ language: string; words: TranscriptWord[]; characterCost?: number | null; providerUsd?: number | null }>;
  save(t: Transcript): Promise<void>;
  log?(message: string, data?: Record<string, unknown>): void;
};

export async function runTranscription(input: TranscribeJobInput, deps: Deps): Promise<{ result: TranscribeJobResult; secondsDone: number; characterCost: number | null; providerUsd: number | null }> {
  const failed: TranscribeJobResult["failed"] = [];
  let secondsDone = 0;
  // The sums are null as soon as one finished file lacked the figure (the bill would be a guess).
  let characterCost: number | null = 0;
  let providerUsd: number | null = 0;
  const queue = [...input.files];

  const once = async (f: TranscribeFile) => {
    try {
      return await deps.transcribe(f.url);
    } catch (e) {
      if (e instanceof TranscribeError && !e.answered) return deps.transcribe(f.url);
      throw e;
    }
  };

  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      try {
        const r = await once(f);
        await deps.save({ url: f.url, language: r.language, words: r.words, engine: TRANSCRIBE_ENGINE.provider, model: TRANSCRIBE_ENGINE.model, durationSeconds: f.seconds });
        secondsDone += f.seconds;
        characterCost = characterCost === null || r.characterCost == null ? null : characterCost + r.characterCost;
        providerUsd = providerUsd === null || r.providerUsd == null ? null : providerUsd + r.providerUsd;
      } catch (e) {
        const reason = e instanceof TranscribeError ? e.reason : "failed";
        deps.log?.("transcribe failed", { url: f.url, reason, detail: e instanceof Error ? e.message : String(e) });
        failed.push({ url: f.url, reason });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, input.files.length) }, worker));
  return { result: { failed }, secondsDone, characterCost: secondsDone > 0 ? characterCost : null, providerUsd: secondsDone > 0 ? providerUsd : null };
}
