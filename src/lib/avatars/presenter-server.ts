import "server-only";
import { getUpstreamOutputs, type UpstreamOutput } from "@/lib/db/nodes";
import { getNodeClientAndData, getScriptPresenterSource } from "@/lib/db/presenter";
import { getAvatar } from "@/lib/db/avatars";
import type { Avatar } from "./schema";
import {
  matchingVoiceReference, presenterInShot, presenterUpstreamRows, readPresenterSwitch, seedanceVoiceText,
  seedingScriptId, withAvatarAsSpeaker,
} from "./presenter";
import { prepareNamedVoiceReference } from "./voice-reference";

// D299 — the presenter of a shot, from the database, and the virtual input it becomes.

export type ShotPresenter = { avatarNodeId: string; avatar: Avatar; inShot: boolean };

/** The presenter of a prompt node, given that node's upstream rows: the script that seeded its
 *  Shot or Multishot, that script's newest avatar edge, and the avatar (archived ones included —
 *  what already uses an avatar keeps working, D287). Null when any link is missing. */
export async function loadPresenterForPromptNode(
  promptNodeId: string,
  ups: readonly UpstreamOutput[],
): Promise<ShotPresenter | null> {
  const scriptId = seedingScriptId(ups);
  if (!scriptId) return null;
  const [owner, source] = await Promise.all([
    getNodeClientAndData(promptNodeId),
    getScriptPresenterSource(scriptId),
  ]);
  if (!owner || !source) return null;
  const avatar = await getAvatar(owner.clientId, source.avatarId);
  if (!avatar) return null;
  return {
    avatarNodeId: source.avatarNodeId,
    avatar,
    inShot: presenterInShot(readPresenterSwitch(owner.data.presenter)),
  };
}

/** The upstream with the presenter's virtual row appended when it is in the shot — and the
 *  script's on-camera speaker renamed as the avatar, so the writer, the stored prompt and the
 *  request all say the same person speaks (`withAvatarAsSpeaker`). */
export function withPresenterRow(
  ups: UpstreamOutput[],
  presenter: ShotPresenter | null,
): UpstreamOutput[] {
  if (!presenter?.inShot || ups.some((u) => u.nodeId === presenter.avatarNodeId)) return ups;
  // D308 — the front, then the profile sheet when there is one.
  const rows = presenterUpstreamRows(presenter.avatarNodeId, presenter.avatar);
  return rows.length > 0 ? [...withAvatarAsSpeaker(ups, presenter.avatar.name), ...rows] : ups;
}

/** D436 — an Avatar node wired straight into this node (a prompt node, or a gen node directly) is a
 *  set of images: its front, then its sheet when current, as the same rows the presenter becomes,
 *  in its place, so every reader of the upstream already handles them. One that no longer exists
 *  or has no front yet drops out. Use on every gen-side read of a node's own upstream. */
export async function withAvatarImages(nodeId: string, ups: UpstreamOutput[]): Promise<UpstreamOutput[]> {
  if (!ups.some((u) => u.type === "avatar")) return ups;
  const owner = await getNodeClientAndData(nodeId);
  const avatars = await Promise.all(
    ups.map((u) => {
      const avatarId = u.data.avatarId;
      return owner && u.type === "avatar" && typeof avatarId === "string" ? getAvatar(owner.clientId, avatarId) : null;
    }),
  );
  return ups.flatMap((u, i) => {
    if (u.type !== "avatar") return [u];
    const avatar = avatars[i];
    return avatar ? presenterUpstreamRows(u.nodeId, avatar, false) : [];
  });
}

/** A prompt node's upstream as everything downstream should see it — wired avatars as images, and
 *  the presenter as a virtual File input when it is in the shot. Use this, not
 *  `getUpstreamOutputs`, wherever a Prompt, Motion Prompt or Multishot Prompt node's upstream is read. */
export async function getPromptUpstream(nodeId: string): Promise<UpstreamOutput[]> {
  const ups = await withAvatarImages(nodeId, await getUpstreamOutputs(nodeId));
  return withPresenterRow(ups, await loadPresenterForPromptNode(nodeId, ups));
}

/** D440 — a gen node takes what is wired into its prompt node as well as what is wired into it, as
 *  Video Gen always did through a Multishot Prompt: the prompt node's upstream (its images, wired
 *  avatars and the presenter in the shot) after the node's own, direct edges first, each node once.
 *  `promptTypes` names which prompt nodes count for this gen node. */
export async function withPromptInputs(
  ups: UpstreamOutput[],
  promptTypes: readonly string[],
): Promise<UpstreamOutput[]> {
  const prompts = ups.filter((u) => promptTypes.includes(u.type));
  if (prompts.length === 0) return ups;
  const batches = await Promise.all(prompts.map((p) => getPromptUpstream(p.nodeId)));
  const seen = new Map(ups.map((u) => [u.nodeId, u]));
  for (const u of batches.flat()) if (!seen.has(u.nodeId)) seen.set(u.nodeId, u);
  return [...seen.values()];
}

export type SeedanceVoice = {
  avatarId: string;
  /** The audio Seedance is given, or null when there is none to give. */
  referenceAudioUrl: string | null;
  /** What the request's text adds about it, or null without a reference. */
  text: string | null;
};

/**
 * On Seedance, the presenter's voice as an audio reference (D299): the voice reference matching
 * the avatar's declaration, made on demand for a named voice whose reference is not there yet
 * (the voice route makes it after declaring; this covers it failing or not having run). Null when
 * the presenter is not in the shot. With no voice, or a reference that cannot be made, the
 * generation goes ahead without audio and Seedance invents a voice — recorded, never refused.
 */
export async function presenterVoiceForSeedance(
  promptNodeId: string,
  promptUps: readonly UpstreamOutput[],
): Promise<SeedanceVoice | null> {
  const presenter = await loadPresenterForPromptNode(promptNodeId, promptUps);
  if (!presenter?.inShot) return null;
  const { avatar } = presenter;
  if (!avatar.voice) return { avatarId: avatar.id, referenceAudioUrl: null, text: null };
  const reference =
    matchingVoiceReference(avatar) ??
    (avatar.voice.mode === "named" ? await prepareNamedVoiceReference(avatar.clientId, avatar) : null);
  return {
    avatarId: avatar.id,
    referenceAudioUrl: reference?.url ?? null,
    text: reference ? seedanceVoiceText(avatar.voice) : null,
  };
}
