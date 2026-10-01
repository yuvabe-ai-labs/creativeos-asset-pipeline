import type { UpstreamOutput } from "@/lib/db/nodes";
import { isOnScreenLine } from "@/lib/nodes/voiceover";
import type { ReelScript, VoLine } from "@/lib/nodes/reel-script";
import type { Avatar, AvatarVoice, AvatarVoiceSample } from "./schema";

// D299 — the presenter in a shot. Pure: the server walks the database and the browser walks the
// canvas store, and both feed these the same rows, so they cannot disagree about a shot.

/** An upstream row, as `getUpstreamOutputs` returns it — only the fields read here. */
export type PresenterRowInput = Pick<UpstreamOutput, "nodeId" | "type" | "data">;

const SEEDED_TYPES = new Set(["shot", "multishot"]);

/** The script that created the prompt node's Shot or Multishot — where its presenter lives. */
export function seedingScriptId(rows: readonly PresenterRowInput[]): string | null {
  for (const row of rows) {
    if (!SEEDED_TYPES.has(row.type)) continue;
    const id = (row.data.seededFrom as { scriptNodeId?: unknown } | undefined)?.scriptNodeId;
    if (typeof id === "string" && id) return id;
  }
  return null;
}

function linesOf(row: PresenterRowInput): VoLine[] {
  if (row.type === "shot") {
    const script = row.data.script as ReelScript | undefined;
    return (script?.visual_script?.shots ?? []).flatMap((s) => s.voiceover ?? []);
  }
  if (row.type === "multishot") {
    const cuts = (row.data.cuts ?? []) as { voiceover?: VoLine[] }[];
    const sequence = (row.data.sequenceVoiceover ?? []) as VoLine[];
    return [...cuts.flatMap((c) => c.voiceover ?? []), ...sequence];
  }
  return [];
}

/** Whether the shot puts a line in someone's mouth on camera — the presenter switch's default. */
export function hasOnCameraLine(rows: readonly PresenterRowInput[]): boolean {
  return rows.some((row) => linesOf(row).some(isOnScreenLine));
}

/** Is the presenter in this shot? The operator's stored choice wins; otherwise the default. */
export function presenterInShot(
  stored: { inShot: boolean } | undefined,
  rows: readonly PresenterRowInput[],
): boolean {
  return stored ? stored.inShot : hasOnCameraLine(rows);
}

/**
 * The presenter as a virtual File input on the prompt node: an image row under the Avatar node's
 * own id. Every reader of a prompt node's upstream — the writers' reference roster, the stored
 * references (by id, BUG-010), the generation routes, Video Gen's image roles and each model's
 * limits — already handles a file image, so the face needs no path of its own.
 */
export function presenterUpstreamRow(
  avatarNodeId: string,
  avatar: Pick<Avatar, "name" | "front">,
): UpstreamOutput | null {
  if (!avatar.front) return null;
  return {
    nodeId: avatarNodeId,
    type: "file",
    data: { title: `Presenter: ${avatar.name}`, fileKind: "image", fileUrl: avatar.front.url },
    activeOutput: null,
    versionId: null,
  };
}

const NAMED_SAMPLE_PREFIX = "elevenlabs:";

/** The `sourceKey` a named voice's reference is recorded under. */
export function namedVoiceSampleKey(voiceId: string): string {
  return `${NAMED_SAMPLE_PREFIX}${voiceId}`;
}

/** The voice reference that belongs to the avatar's current declaration, or null. A sample made
 *  for another voice — or for the engine's own voice after a named one is chosen — is ignored. */
export function matchingVoiceReference(
  avatar: Pick<Avatar, "voice" | "voiceSample">,
): AvatarVoiceSample | null {
  const sample = avatar.voiceSample;
  const voice = avatar.voice;
  if (!sample || !voice) return null;
  if (voice.mode === "named") return sample.sourceKey === namedVoiceSampleKey(voice.voiceId) ? sample : null;
  return sample.sourceKey.startsWith(NAMED_SAMPLE_PREFIX) ? null : sample;
}

/** What Seedance's text says about the audio reference: bind it by position, keep it to the
 *  voice's timbre (or the reference's music and effects come along), and describe the voice in
 *  words — BytePlus's own fix for a generated voice that drifts from its reference. */
export function seedanceVoiceText(voice: AvatarVoice): string {
  const bind = "Reference only the voice timbre in @Audio 1, not its music or sound effects.";
  if (voice.mode === "native") return `${bind} The voice is the presenter's own voice from that reference.`;
  const words = [voice.labels.gender, voice.labels.age, voice.labels.language, voice.labels.accent, voice.labels.description]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
  return words.length ? `${bind} The voice: ${words.join(", ")}.` : bind;
}
