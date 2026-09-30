import { revoiceVideo, NonRetryableRevoiceError, type RevoiceDeps } from "@/lib/voice-change/revoice";
import type { VoiceChangeSettings } from "@/lib/elevenlabs/voice-settings";
import { VOICE_MAX_SECONDS, VOICE_MIN_SECONDS } from "@/lib/ugc/constants";

// D294, D296 — the avatar-voice-preview task's steps, with every outside call injected so they
// can be tested without Google, BytePlus, ElevenLabs or ffmpeg. One function per mode; each
// generates its paid clip exactly once. No `server-only`: the Trigger task imports this.

// ── Shared ────────────────────────────────────────────────────────────────────

/** What either run needs from its engine. `startFrameUrl` animates a frame (Omni);
 *  `referenceUrls` carry a face to be re-drawn (Seedance, which treats frames and references as
 *  mutually exclusive and accepts a face only as a reference). */
export type GenerateClip = (input: {
  prompt: string;
  startFrameUrl?: string;
  referenceUrls: string[];
  params: Record<string, unknown>;
}) => Promise<{ videoUrl: string; durationSeconds: number }>;

// ── Named voice: Omni, then re-voiced with the avatar's ElevenLabs voice ───────

export type VoicePreviewRunPayload = {
  frontUrl: string;
  prompt: string;
  params: Record<string, unknown>;
  voiceId: string;
  settings: VoiceChangeSettings;
  revoicedPutUrl: string;
};

/** What the route sends the task for a named preview: the run itself, plus which generation to
 *  report on and the public URL the signed upload lands at. */
export type NamedVoicePreviewTaskPayload = VoicePreviewRunPayload & {
  mode: "named";
  generationId: string;
  revoicedUrl: string;
};

export type VoicePreviewRunDeps = RevoiceDeps & {
  generateClip: GenerateClip;
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

// ── The engine's own voice: Seedance, whose voice is kept as the avatar's reference ──

export type NativeVoicePreviewPayload = {
  frontUrl: string;
  prompt: string;
  params: Record<string, unknown>;
  /** Signed PUT + public URL for the clip. The vendor's own URL expires in 24 hours, so the
   *  clip has to be copied into our bucket to be playable later at all. */
  clipPutUrl: string;
  clipUrl: string;
  /** Signed PUT + public URL for the extracted mp3 — the avatar's voice reference. */
  samplePutUrl: string;
  sampleUrl: string;
};

export type NativeVoicePreviewTaskPayload = NativeVoicePreviewPayload & {
  mode: "native";
  generationId: string;
};

export type AvatarVoicePreviewTaskPayload =
  | NamedVoicePreviewTaskPayload
  | NativeVoicePreviewTaskPayload;

export type NativeVoicePreviewDeps = {
  generateClip: GenerateClip;
  fetchBytes: (url: string) => Promise<Buffer>;
  extractVoiceReference: (video: Buffer, maxSeconds: number) => Promise<Buffer>;
  probeDurationSeconds: (media: Buffer, ext: string) => Promise<number>;
  putBytes: (url: string, body: Buffer, contentType: string) => Promise<void>;
};

export const VOICE_SAMPLE_TOO_SHORT_MESSAGE =
  `The clip's voice is under ${VOICE_MIN_SECONDS}s, which is too short to use as a voice ` +
  `reference. Try a longer line.`;

/**
 * Seedance draws the front image speaking the line and invents a voice for it. Both are kept:
 * the clip, so the operator can watch it, and the voice on its own, as the `reference_audio`
 * every later generation sends so the avatar keeps one voice (§6.7).
 *
 * The clip is stored BEFORE the audio is extracted. It is the paid artefact, and if the
 * extraction then fails there is still something to look at and to diagnose from — where
 * extracting first would throw away a clip Google's vendor has already billed.
 */
export async function runNativeVoicePreview(
  payload: NativeVoicePreviewPayload,
  deps: NativeVoicePreviewDeps,
): Promise<{
  durationSeconds: number;
  sample: { url: string; durationSeconds: number };
}> {
  const clip = await deps.generateClip({
    prompt: payload.prompt,
    // A face goes in as a REFERENCE, never a first frame: Seedance treats frames and references
    // as mutually exclusive, and a first frame would pin the picture rather than the person.
    referenceUrls: [payload.frontUrl],
    params: payload.params,
  });

  const bytes = await deps.fetchBytes(clip.videoUrl);
  await deps.putBytes(payload.clipPutUrl, bytes, "video/mp4");

  const mp3 = await deps.extractVoiceReference(bytes, VOICE_MAX_SECONDS);
  const sampleSeconds = await deps.probeDurationSeconds(mp3, "mp3");
  // Seedance refuses a reference under two seconds, so storing one would leave a sample that
  // every later generation rejects.
  if (sampleSeconds < VOICE_MIN_SECONDS) throw new Error(VOICE_SAMPLE_TOO_SHORT_MESSAGE);
  await deps.putBytes(payload.samplePutUrl, mp3, "audio/mpeg");

  return {
    durationSeconds: clip.durationSeconds,
    sample: { url: payload.sampleUrl, durationSeconds: sampleSeconds },
  };
}
