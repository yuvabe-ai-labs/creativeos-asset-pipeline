import type { UpstreamOutput } from "@/lib/db/nodes";
import { isOnScreenLine } from "@/lib/nodes/voiceover";
import type { ReelScript, VoLine } from "@/lib/nodes/reel-script";
import { videoGenClientModelMap } from "@/lib/video-gen/client-models";
import { avatarWorksWith } from "./generation";
import { avatarSheetId } from "@/lib/video-gen/select-references";
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
    data: {
      // Read by the upstream mappers: label "Presenter", name = the avatar's name, so the roster
      // entry reads "Presenter: Riya".
      presenter: true,
      title: avatar.name,
      fileKind: "image",
      fileUrl: avatar.front.url,
      // A file node's processedOutput is its text block for the writer (node-output.ts). Identity
      // only: "as they appear in this image" once had the writer copy the portrait's plain
      // backdrop into the look as a "white studio" shot.
      processedOutput: `${avatar.name}, the person on camera in this shot. Take only their face, hair, build and clothing from this image, never its plain background, lighting or framing.`,
    },
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
  const { gender, age, language, accent, description } = voice.labels;
  const words = [
    clean(gender),
    clean(age),
    languageName(clean(language)),
    clean(accent) && `${titleCase(clean(accent)!)} accent`,
    clean(description),
  ].filter((v): v is string => Boolean(v));
  return words.length ? `${bind} The voice: ${words.join(", ")}.` : bind;
}

/** ElevenLabs labels are slugs ("middle_aged"); the model reads words. */
function clean(label: string | undefined): string | undefined {
  const text = label?.trim().replace(/_/g, "-");
  return text || undefined;
}

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "en" → "English"; a label that is already a name passes through. */
function languageName(label: string | undefined): string | undefined {
  if (!label) return undefined;
  if (!/^[a-z]{2,3}(-[a-z]{2})?$/i.test(label)) return label;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(label) ?? label;
  } catch {
    return label;
  }
}

/**
 * The script's on-camera speaker, renamed as the avatar in the shot. A script says who talks —
 * "creator", "host" — while the beats name the avatar ("Razel, the woman…"), and a video model
 * hearing `creator says` beside a woman called Razel has no way to know they are one person. With
 * exactly one on-camera speaker across the shot's lines, that speaker is the avatar; with two or
 * more, which one is unknown and nothing changes. Narration stays narration. Same rows back
 * (identity) when there is nothing to rename.
 */
export function withAvatarAsSpeaker<T extends PresenterRowInput>(rows: T[], avatarName: string): T[] {
  const name = avatarName.trim();
  if (!name) return rows;
  const speakers = new Set(
    rows.flatMap(linesOf).filter(isOnScreenLine).map((l) => l.speaker!.trim().toLowerCase()),
  );
  if (speakers.size !== 1) return rows;
  const rename = (lines: VoLine[] | undefined) =>
    lines?.map((l) => (isOnScreenLine(l) ? { ...l, speaker: name } : l));

  return rows.map((row) => {
    if (row.type === "multishot") {
      const cuts = (row.data.cuts ?? []) as { voiceover?: VoLine[] }[];
      return {
        ...row,
        data: {
          ...row.data,
          cuts: cuts.map((c) => (c.voiceover ? { ...c, voiceover: rename(c.voiceover) } : c)),
          ...(row.data.sequenceVoiceover ? { sequenceVoiceover: rename(row.data.sequenceVoiceover as VoLine[]) } : {}),
        },
      };
    }
    if (row.type === "shot") {
      const script = row.data.script as ReelScript | undefined;
      const shots = script?.visual_script?.shots;
      if (!script || !shots) return row;
      return {
        ...row,
        data: {
          ...row.data,
          script: {
            ...script,
            visual_script: { ...script.visual_script, shots: shots.map((sh) => ({ ...sh, voiceover: rename(sh.voiceover) })) },
          },
        },
      };
    }
    return row;
  });
}

/**
 * D308 — every image the avatar brings into a shot: its front (the row above), then its profile
 * sheet under a virtual id of its own, when it has one that is not out of date. The sheet carries
 * build and outfit the waist-up front cannot; the text keeps it identity only, because a
 * multi-view sheet on a plain backdrop has been read as a location before.
 */
export function presenterUpstreamRows(
  avatarNodeId: string,
  avatar: Pick<Avatar, "name" | "front" | "sheet" | "sheetStale">,
): UpstreamOutput[] {
  const front = presenterUpstreamRow(avatarNodeId, avatar);
  if (!front) return [];
  if (!avatar.sheet || avatar.sheetStale) return [front];
  return [
    front,
    {
      nodeId: avatarSheetId(avatarNodeId),
      type: "file",
      data: {
        presenter: "sheet",
        title: avatar.name,
        fileKind: "image",
        fileUrl: avatar.sheet.url,
        processedOutput: `${avatar.name}'s profile sheet: front, side and back views of the same person, for their build and outfit. Identity only: never its plain background, lighting or layout.`,
      },
      activeOutput: null,
      versionId: null,
    },
  ];
}

/** The prompt node's stored switch, or undefined when the operator has not chosen. */
export function readPresenterSwitch(raw: unknown): { inShot: boolean } | undefined {
  const inShot = (raw as { inShot?: unknown } | undefined)?.inShot;
  return typeof inShot === "boolean" ? { inShot } : undefined;
}

const FAMILY_BY_PROVIDER: Record<string, string> = {
  seedance: "Seedance", gemini: "Gemini Omni", kling: "Kling", veo: "Veo",
};

/** Why a video model can't use this presenter's face — the operator reads this on the chip. */
function unavailableReason(family: string, avatar: Pick<Avatar, "front">): string {
  if (family === "Seedance") {
    return avatar.front?.source.kind === "generated"
      ? "Seedance only takes faces made with Seedream 5.0 Lite"
      : "Seedance refuses a real person's face";
  }
  return "Google may refuse a real person's face";
}

/** The video models the presenter's face rules out, by model id, each with its reason (D299). */
export function unavailableModelsFor(avatar: Pick<Avatar, "front">): Record<string, string> {
  const works = avatarWorksWith(avatar);
  const out: Record<string, string> = {};
  for (const [id, spec] of Object.entries(videoGenClientModelMap)) {
    const family = FAMILY_BY_PROVIDER[spec.provider];
    if (family && !works.includes(family)) out[id] = unavailableReason(family, avatar);
  }
  return out;
}

/** What Video Gen tells the operator about the presenter on this model (D299 spec §4, §5.3). */
export function presenterVideoNotes(args: {
  avatar: Pick<Avatar, "voice" | "voiceSample">;
  provider: string | undefined;
  hasStartFrame: boolean;
}): string[] {
  const { avatar, provider, hasStartFrame } = args;
  const notes: string[] = [];
  if (provider === "seedance") {
    if (hasStartFrame) {
      notes.push("Seedance uses the still as its first frame, so the avatar's face can't be sent as well. The voice still is.");
    }
    if (avatar.voice?.mode === "native" && !matchingVoiceReference(avatar)) {
      notes.push("The avatar's voice isn't kept yet, so Seedance will make one up. Make a voice preview in the Studio to keep one.");
    }
  } else if (avatar.voice?.mode === "native" && !avatar.voice.autoVoice) {
    // With an auto voice (D301), Edit voice offers it on these models, so the voice does carry.
    notes.push("Only Seedance keeps this avatar's voice the same across clips.");
  }
  return notes;
}

/** D299/D301 — the voice Edit voice pre-selects for the presenter: its named voice, or the auto
 *  voice kept for a voice chosen for it. Null when there is neither. */
export function presenterDefaultVoiceId(avatar: Pick<Avatar, "voice">): string | null {
  const voice = avatar.voice;
  if (voice?.mode === "named") return voice.voiceId;
  return voice?.mode === "native" ? voice.autoVoice?.voiceId ?? null : null;
}

/** D301 — a voice chosen for the avatar whose latest kept sample has no auto voice cloned from it:
 *  the clone failed, so the voice is not yet kept for models other than Seedance. */
export function avatarAutoVoiceMissing(avatar: Pick<Avatar, "voice" | "voiceSample">): boolean {
  if (avatar.voice?.mode !== "native" || !avatar.voiceSample) return false;
  if (avatar.voiceSample.sourceKey.startsWith(NAMED_SAMPLE_PREFIX)) return false;
  return avatar.voice.autoVoice?.sourceKey !== avatar.voiceSample.sourceKey;
}
