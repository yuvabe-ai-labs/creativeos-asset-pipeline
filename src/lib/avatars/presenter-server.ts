import "server-only";
import { getUpstreamOutputs, type UpstreamOutput } from "@/lib/db/nodes";
import { getNodeClientAndData, getScriptPresenterSource } from "@/lib/db/presenter";
import { getAvatar } from "@/lib/db/avatars";
import type { Avatar } from "./schema";
import { presenterInShot, presenterUpstreamRow, readPresenterSwitch, seedingScriptId } from "./presenter";

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
