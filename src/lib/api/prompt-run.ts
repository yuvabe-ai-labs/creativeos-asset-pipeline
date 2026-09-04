import "server-only";
import { insertVersion, setActiveVersion } from "@/lib/db/versions";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import { computeCost, type TokenUsage } from "@/lib/pricing";
import {
  reserveCredits,
  settleGeneration,
  refundReservation,
  CreditLimitError,
} from "@/lib/db/credit-transactions";
import type { GenerationRow } from "@/lib/db/types";

export { CreditLimitError };

// The shape a model call hands back: the two canonical fields computeCost reads (typed via
// TokenUsage), plus whatever else the provider included (e.g. prompt_tokens_details,
// completion_tokens_details) passed through untouched. Callers must NOT narrow usage down to
// the three canonical fields before returning it here — the narrow numbers are still all
// computeCost uses, but the raw object is what gets persisted, and narrowing here would make
// every model's usage column the same width, dropping fields a future pricing change might need.
export type ModelUsage = TokenUsage & Record<string, unknown>;

// The credit + version envelope around one text-model call — reserve → insert the generation
// row → invoke the model → settle (success) or refund (failure) → insert the version → move
// the active pointer. Moved out of video-prompt/route.ts (Task 12), whose own header comment
// records that it "previously logged a version but never joined the credit ledger at all" — a
// real shipped defect. Extracted before a second prompt-type route (multishot) exists, so
// that route is written against this helper instead of against a second copy of the same
// reserve/settle/refund flow, where the same defect could reappear.
//
// Deliberately NOT owned here: the shape of the FAILED version written on error.
// video-prompt/route.ts always logs a failed attempt as a version, but the fields it writes
// (targetProvider, promptId, promptVersion, the frozen request) are route-specific. The route
// supplies that write as `onFailure`, which this function calls before its own
// failGeneration/refundReservation cleanup — preserving the original call order
// (insertVersion(failed) → failGeneration → refundReservation) across the extraction — and
// then rethrows the original error regardless of what onFailure does.
export async function runPromptGeneration<T>(args: {
  nodeId: string;
  orgId: string;
  clientId?: string;
  userId?: string;
  userEmail?: string | null;
  // R11.1: the maker, as a real user reference — forwarded to insertVersion's operatorUserId.
  operatorUserId?: string | null;
  type: GenerationRow["type"];
  model: string;
  // Computed by the caller (e.g. estimatePromptCredits) — attachment-counting and similar
  // estimation policy is prompt-type-specific and stays at the call site.
  estimatedCredits: number;
  generationParamsSnapshot?: Record<string, unknown>;
  generationInputsSnapshot?: Record<string, unknown>;
  // Everything the success version's inputs_used/params_used should carry EXCEPT tokensUsed,
  // which this function fills in from the call's own usage figure.
  inputsUsed: Record<string, unknown>;
  paramsUsed: Record<string, unknown>;
  call: () => Promise<{ output: T; usage: ModelUsage | null }>;
  // Invoked on the error path, before failGeneration/refundReservation — mirrors the call
  // order this route had before the extraction (insertVersion(failed) → failGeneration →
  // refundReservation). Route-specific because the failed version's own fields
  // (targetProvider, promptId, promptVersion, the frozen request) aren't known here. A
  // throwing onFailure is swallowed so it can never mask the real error, which always
  // propagates regardless of what onFailure does.
  onFailure?: (error: unknown) => Promise<void> | void;
}): Promise<{ output: T; versionId: string; generationId: string; usage: ModelUsage | null }> {
  const generation = await insertGeneration({
    nodeId: args.nodeId,
    orgId: args.orgId,
    clientId: args.clientId,
    userId: args.userId,
    userEmail: args.userEmail,
    type: args.type,
    modelUsed: args.model,
    paramsSnapshot: args.generationParamsSnapshot,
    inputsSnapshot: args.generationInputsSnapshot,
  });

  try {
    const reservation = await reserveCredits(args.orgId, generation.id, args.estimatedCredits);
    if (!reservation.ok) {
      throw new CreditLimitError("Monthly credit limit reached");
    }

    const { output, usage } = await args.call();

    const version = await insertVersion({
      nodeId: args.nodeId,
      operatorUserId: args.operatorUserId,
      inputsUsed: args.inputsUsed,
      paramsUsed: { ...args.paramsUsed, tokensUsed: usage ?? null },
      modelUsed: args.model,
      output,
    });
    await setActiveVersion(args.nodeId, version.id);

    const cost = usage ? computeCost(args.model, usage) : null;
    // Prompt-type generations settle on the same flat estimate used for the reservation, not
    // real model $ cost (see the comment this carried in video-prompt/route.ts before the
    // move) — real cost is still recorded via costUsd below for admin visibility, it just
    // doesn't drive credits_charged.
    await settleGeneration({
      orgId: args.orgId,
      generationId: generation.id,
      actualAmount: args.estimatedCredits,
    });
    await succeedGeneration({
      generationId: generation.id,
      versionId: version.id,
      costUsd: cost?.usd,
      creditsCharged: args.estimatedCredits,
      tokensUsed: usage ? { ...usage } : null,
      outputSnapshot: typeof output === "string" ? output : JSON.stringify(output),
    });

    return { output, versionId: version.id, generationId: generation.id, usage };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    if (args.onFailure) {
      try {
        await args.onFailure(e);
      } catch {
        // A failing onFailure must not mask the original error below — swallow and continue
        // the same cleanup every other failure path gets.
      }
    }
    await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
    await refundReservation({ orgId: args.orgId, generationId: generation.id }).catch(() => null);
    throw e;
  }
}
