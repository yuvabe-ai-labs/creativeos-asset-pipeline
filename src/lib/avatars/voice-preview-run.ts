import { revoiceVideo, NonRetryableRevoiceError, type RevoiceDeps } from "@/lib/voice-change/revoice";
import type { VoiceChangeSettings } from "@/lib/elevenlabs/voice-settings";

// D294 — the avatar-voice-preview task's steps, with every outside call injected so they can be
// tested without Google, ElevenLabs or ffmpeg. No `server-only`: the Trigger task imports this.

export type VoicePreviewRunPayload = {
  frontUrl: string;
  prompt: string;
  params: Record<string, unknown>;
  voiceId: string;
  settings: VoiceChangeSettings;
  revoicedPutUrl: string;
};

/** What the route sends the task: the run itself, plus which generation to report on and the
 *  public URL the signed upload lands at. */
export type AvatarVoicePreviewTaskPayload = VoicePreviewRunPayload & {
  generationId: string;
  revoicedUrl: string;
};

export type VoicePreviewRunDeps = RevoiceDeps & {
  generateClip: (input: {
    prompt: string;
    startFrameUrl: string;
    referenceUrls: string[];
    params: Record<string, unknown>;
  }) => Promise<{ videoUrl: string; durationSeconds: number }>;
  wait: (ms: number) => Promise<void>;
};

export const VOICE_PREVIEW_REVOICE_ATTEMPTS = 2;
const REVOICE_RETRY_WAIT_MS = 5000;

/**
 * The front image speaks the line in the engine's own voice; that voice is then replaced with
 * the avatar's, keeping the timing (and so the lip-sync) of the clip.
 *
 * The clip is generated ONCE. It is the expensive half and is billed by Google whether or not
 * the voice change then succeeds, so a passing ElevenLabs failure (a rate limit, a 5xx, a
 * dropped connection) retries the voice change alone against the same clip. A failure that
 * cannot clear up — no audio, a refused request, a voice that came back out of sync — is thrown
 * at once.
 */
export async function runVoicePreview(
  payload: VoicePreviewRunPayload,
  deps: VoicePreviewRunDeps,
): Promise<{ durationSeconds: number; driftMs: number }> {
  const clip = await deps.generateClip({
    prompt: payload.prompt,
    startFrameUrl: payload.frontUrl,
    referenceUrls: [],
    params: payload.params,
  });

  for (let attempt = 1; ; attempt += 1) {
    try {
      const { driftMs } = await revoiceVideo(
        {
          sourceUrl: clip.videoUrl,
          voiceId: payload.voiceId,
          revoicedPutUrl: payload.revoicedPutUrl,
          settings: payload.settings,
        },
        deps,
      );
      return { durationSeconds: clip.durationSeconds, driftMs };
    } catch (e) {
      if (e instanceof NonRetryableRevoiceError || attempt >= VOICE_PREVIEW_REVOICE_ATTEMPTS) throw e;
      await deps.wait(REVOICE_RETRY_WAIT_MS);
    }
  }
}
