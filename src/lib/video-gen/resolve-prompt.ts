import type { UpstreamOutput } from "@/lib/db/nodes";
import { renderPlan, type MultishotPlan } from "@/lib/nodes/multishot-plan";
import { multishotCapabilityFor } from "@/lib/nodes/multishot-models";
import type { MultishotCut } from "@/lib/nodes/multishot-cuts";

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
      /**
       * Only set for the multishot lane — the model the plan was WRITTEN for (D236), read off the
       * plan's own `targetModel` stamp and NOT off the Multishot node's current field. The route
       * generates on this, not on the node's stored `modelId`: the plan's beats carry this model's
       * reference tokens and its ladder was built against this model's window, so a request on any
       * other model is a payload built from the wrong contract.
       *
       * `null` = the plan carries no stamp, which means Gemini Omni (see below).
       */
      targetModel: string | null;
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
      targetModel: null,
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

  // D236 — the model the plan was WRITTEN for, read off THE PLAN, never off the Multishot node's
  // current `targetModel`.
  //
  // This is the money path's whole correctness argument. The node's field is a setting the
  // operator can flip at any moment; the beats are text that was already written. Reading the
  // node here meant switching the Select after a plan existed re-rendered Omni's beats — with
  // Omni's `<IMAGE_REF_0>` tokens in them — as Kling triples, `refsCitedIn` found nothing,
  // `checkPlanLimits` passed, and the route's own model guard passed too (it compares against
  // this same value), so Kling generated and BILLED with the reference unbound and no error
  // raised anywhere.
  //
  // An unstamped plan falls back to the DEFAULT (Gemini Omni) via `multishotCapabilityFor`, not
  // to the node's field: every plan written before the stamp existed was Omni's, because Omni was
  // the only multishot model. That fallback is the migration. Falling back to the node would
  // reintroduce exactly the bug above for every pre-stamp plan.
  const targetModel = typeof plan.targetModel === "string" ? plan.targetModel : null;
  const cap = multishotCapabilityFor(targetModel);

  return {
    ok: true,
    prompt: renderPlan(plan, cuts, cap),
    promptNode,
    promptUpstream,
    cuts,
    targetModel,
  };
}

