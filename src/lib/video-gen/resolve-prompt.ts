import type { UpstreamOutput } from "@/lib/db/nodes";
import { renderPlan, type MultishotPlan } from "@/lib/nodes/multishot-plan";
import { totalOf, type MultishotCut } from "@/lib/nodes/multishot-cuts";

// Two prompt-node lanes feed Video Gen (see AGENTS.md / the multishot spec):
//   shot      -> video-prompt      -> video-gen   (activeOutput is a STRING)
//   multishot -> multishot-prompt  -> video-gen   (activeOutput is a MultishotPlan OBJECT,
//                                                   rendered via renderPlan(plan, cuts) —
//                                                   the cuts live one level further upstream,
//                                                   on the connected Multishot node)
//
// This is a three-level walk for the multishot lane: video-gen -> multishot-prompt -> multishot.
// Extracted as a pure(-ish) function — the only side effect is the injected `fetchUpstream`,
// which the route supplies as getUpstreamOutputs and tests supply as a canned lookup — so the
// money-path logic (never stringify a plan object; never proceed without cuts) is unit-testable
// without a database.

export type ResolvedPrompt =
  | {
      ok: true;
      prompt: string;
      promptNode: UpstreamOutput;
      /**
       * The prompt node's OWN direct upstream — a video-prompt node's images, or a
       * multishot-prompt node's connected Multishot node plus any images attached straight to
       * it. Same traversal position in both lanes, so `<IMAGE_REF_N>` numbering (assigned at
       * the prompt node, over ITS upstream, in ITS order) means the same thing on either side of
       * this function — see orderImagesForPromptTokens.
       */
      promptUpstream: UpstreamOutput[];
      /** Only set for the multishot lane — the cut list the ladder (and its duration) rest on. */
      cuts: MultishotCut[] | null;
    }
  | { ok: false; reason: string };

const NO_PROMPT_NODE_ERROR =
  "No connected video-prompt or multishot-prompt node with output found.";

const NO_MULTISHOT_CUTS_ERROR =
  "The connected multishot-prompt node's upstream Multishot node (with its cut list) could not be found.";

/**
 * Resolve the text actually sent to the video model, from whichever prompt-node lane feeds this
 * Video Gen node.
 *
 * Never falls through to `String(activeOutput)` for a multishot-prompt node — that would ship
 * `"[object Object]"` to a paid video model. A multishot-prompt connected but unresolvable
 * (no output yet, or its Multishot node/cuts can't be found) is a hard error instead.
 */
export async function resolveVideoGenPrompt(
  upstream: UpstreamOutput[],
  fetchUpstream: (nodeId: string) => Promise<UpstreamOutput[]>,
): Promise<ResolvedPrompt> {
  const promptNode = upstream.find(
    (u) => u.type === "video-prompt" || u.type === "multishot-prompt",
  );
  if (!promptNode) return { ok: false, reason: NO_PROMPT_NODE_ERROR };

  if (promptNode.type === "video-prompt") {
    if (!promptNode.activeOutput) return { ok: false, reason: NO_PROMPT_NODE_ERROR };
    const promptUpstream = await fetchUpstream(promptNode.nodeId);
    return {
      ok: true,
      prompt: String(promptNode.activeOutput),
      promptNode,
      promptUpstream,
      cuts: null,
    };
  }

  // multishot-prompt: activeOutput is a MultishotPlan, never a string.
  const plan = promptNode.activeOutput as MultishotPlan | null | undefined;
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.beats)) {
    return { ok: false, reason: NO_PROMPT_NODE_ERROR };
  }

  const promptUpstream = await fetchUpstream(promptNode.nodeId);
  const multishotNode = promptUpstream.find((u) => u.type === "multishot");
  // Same defensive filter resolveMultishotPromptInputs applies (resolve-inputs.ts) — a malformed
  // cut must not reach renderPlan, which assumes `cut.seconds` is a number and `cut.text` a string.
  const cuts = ((multishotNode?.data.cuts as MultishotCut[] | undefined) ?? []).filter(
    (c) => c && c.id && typeof c.text === "string" && typeof c.seconds === "number",
  );
  if (!multishotNode || cuts.length === 0) {
    return { ok: false, reason: NO_MULTISHOT_CUTS_ERROR };
  }

  return { ok: true, prompt: renderPlan(plan, cuts), promptNode, promptUpstream, cuts };
}

/**
 * The multishot lane's duration backstop, mirroring the D97 "reject rather than correct" pattern
 * in constraints.ts: the ladder's timestamps are built cumulatively from the cuts (renderPlan), so
 * a request `duration` that disagrees with `sum(cuts.seconds)` comes back TRUNCATED AT FULL PRICE
 * — see multishot-cuts.ts. Checked before insertGeneration/reserveCredits, same placement reason.
 */
export function checkMultishotDuration(
  cuts: MultishotCut[],
  requestedSeconds: number,
): string | null {
  const total = totalOf(cuts);
  if (requestedSeconds !== total) {
    return (
      `Requested duration (${requestedSeconds}s) does not match the connected Multishot node's ` +
      `cut budget (${total}s). Set duration to ${total}s, or edit the cuts, before generating.`
    );
  }
  return null;
}
