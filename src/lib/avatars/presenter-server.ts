import "server-only";
import { getUpstreamOutputs, type UpstreamOutput } from "@/lib/db/nodes";
import { getNodeClientAndData, getScriptPresenterSource } from "@/lib/db/presenter";
import { getAvatar } from "@/lib/db/avatars";
import type { Avatar } from "./schema";
import {
  matchingVoiceReference, presenterInShot, presenterUpstreamRow, readPresenterSwitch, seedanceVoiceText,
  seedingScriptId,
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
    inShot: presenterInShot(readPresenterSwitch(owner.data.presenter), ups),
  };
}

/** The upstream with the presenter's virtual row appended when it is in the shot. */
export function withPresenterRow(
  ups: UpstreamOutput[],
  presenter: ShotPresenter | null,
): UpstreamOutput[] {
  if (!presenter?.inShot || ups.some((u) => u.nodeId === presenter.avatarNodeId)) return ups;
  const row = presenterUpstreamRow(presenter.avatarNodeId, presenter.avatar);
  return row ? [...ups, row] : ups;
}

/** A prompt node's upstream as everything downstream should see it — with the presenter as a
 *  virtual File input when it is in the shot. Use this, not `getUpstreamOutputs`, wherever a
 *  Prompt, Motion Prompt or Multishot Prompt node's upstream is read. */
export async function getPromptUpstream(nodeId: string): Promise<UpstreamOutput[]> {
  const ups = await getUpstreamOutputs(nodeId);
  return withPresenterRow(ups, await loadPresenterForPromptNode(nodeId, ups));
}

/** For a still: Image Gen takes connected images directly, so when the Prompt feeding it has the
 *  presenter in the shot, the face joins Image Gen's own upstream. */
export async function withStillPresenter(imageGenUps: UpstreamOutput[]): Promise<UpstreamOutput[]> {
  const prompt = imageGenUps.find((u) => u.type === "prompt");
  if (!prompt) return imageGenUps;
  const promptUps = await getUpstreamOutputs(prompt.nodeId);
  return withPresenterRow(imageGenUps, await loadPresenterForPromptNode(prompt.nodeId, promptUps));
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
