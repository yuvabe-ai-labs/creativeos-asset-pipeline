import type { UpstreamOutput } from "@/lib/db/nodes";
import { renderPlan, planCitedRefIds, planMissingRefs, type MultishotPlan } from "@/lib/nodes/multishot-plan";
import { multishotCapabilityFor } from "@/lib/nodes/multishot-models";
import type { MultishotCut } from "@/lib/nodes/multishot-cuts";
import { mapUpstreamForVideo } from "@/lib/nodes/resolve-inputs";
import { multishotVoiceover } from "@/lib/nodes/voiceover";
import type { VoLine } from "@/lib/nodes/reel-script";
import {
  citedRefIds,
  refEntriesOf,
  renderRefs,
  singleTakeRefDialect,
  type RefEntry,
} from "@/lib/nodes/ref-binding";
import { imageRefDialect } from "@/lib/nodes/prompt-token-dialect";

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
      /** D286 — only set for the multishot lane — lines spanning every cut, rendered in the header. */
      sequenceVoiceover: VoLine[] | undefined;
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
      /**
       * BUG-010 — images the prompt cites by id that are no longer among the prompt node's
       * references. Non-empty means the rendered `prompt` names them in plain text where a token
       * should be; the route refuses to generate rather than ship a clip missing its product.
       */
      missingRefs: RefEntry[];
    }
  | { ok: false; reason: string };

/**
 * The order the prompt node's writer numbered references in — `refEntriesOf` over the same
 * `mapUpstreamForVideo` mapping the write side used — so an unchanged canvas renders a stored
 * prompt back to exactly the text it was written as.
 */
function refIdsOf(promptUpstream: UpstreamOutput[]): string[] {
  return refEntriesOf(promptUpstream.map((u) => mapUpstreamForVideo(u))).map((r) => r.id);
}

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
  /**
   * BUG-010 — the single-take prompt's token dialect: `"gemini-omni"` or `"seedance"` render
   * stored ids to that model's positions; anything else (Veo, Kling: prose) sends the text as is.
   * Derived by the route from the Video Gen model's provider.
   */
  singleTakeTarget?: string,
): Promise<ResolvedPrompt> {
  const promptNode = upstream.find(
    (u) => u.type === "video-prompt" || u.type === "multishot-prompt",
  );
  if (!promptNode) return { ok: false, reason: NO_PROMPT_NODE_ERROR };

  if (promptNode.type === "video-prompt") {
    if (!promptNode.activeOutput) return { ok: false, reason: NO_PROMPT_NODE_ERROR };
    const promptUpstream = await fetchUpstream(promptNode.nodeId);
    const dialect = singleTakeRefDialect(singleTakeTarget, refIdsOf(promptUpstream));
    const text = String(promptNode.activeOutput);
    const rendered = dialect ? renderRefs(text, dialect) : { text, missing: [] };
    return {
      ok: true,
      prompt: rendered.text,
      promptNode,
      promptUpstream,
      cuts: null,
      sequenceVoiceover: undefined,
      targetModel: null,
      missingRefs: rendered.missing,
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
  const refIds = refIdsOf(promptUpstream);
  // D307 — one list for the sequence, with any lines an older node left on its cuts.
  const sequenceVoiceover = multishotVoiceover(multishotNode.data);

  return {
    ok: true,
    prompt: renderPlan(plan, cuts, cap, refIds, sequenceVoiceover),
    promptNode,
    promptUpstream,
    cuts,
    sequenceVoiceover,
    targetModel,
    missingRefs: planMissingRefs(plan, cap, refIds),
  };
}


/**
 * D308 — the images the resolved prompt cites, by id: second in reference priority, after the
 * avatar's front (selectReferences). Reads both stored ids and legacy positions.
 */
export function citedIdsOfResolved(
  resolved: Extract<ResolvedPrompt, { ok: true }>,
  singleTakeTarget?: string,
): Set<string> {
  const refIds = refIdsOf(resolved.promptUpstream);
  if (resolved.cuts) {
    const plan = resolved.promptNode.activeOutput as MultishotPlan;
    return planCitedRefIds(plan, multishotCapabilityFor(resolved.targetModel), refIds);
  }
  const text = String(resolved.promptNode.activeOutput ?? "");
  // Providers with no token dialect still store citations as ids; any dialect reads those.
  const dialect = singleTakeRefDialect(singleTakeTarget, refIds) ?? imageRefDialect(refIds);
  return new Set(citedRefIds(text, dialect));
}

/**
 * D308 — the prompt as sent: its image tokens numbered over `refOrder`, the references the request
 * actually carries, not over every image the prompt node can see. A citation of an image left out
 * is written as its name rather than a number pointing at the wrong picture (renderRefs).
 */
export function renderResolvedPrompt(
  resolved: Extract<ResolvedPrompt, { ok: true }>,
  refOrder: string[],
  singleTakeTarget?: string,
): string {
  if (resolved.cuts) {
    const plan = resolved.promptNode.activeOutput as MultishotPlan;
    return renderPlan(plan, resolved.cuts, multishotCapabilityFor(resolved.targetModel), refOrder, resolved.sequenceVoiceover);
  }
  const text = String(resolved.promptNode.activeOutput ?? "");
  const dialect = singleTakeRefDialect(singleTakeTarget, refOrder);
  return dialect ? renderRefs(text, dialect).text : text;
}
