import type { TraceableBrandKB } from "./schema";

// Brand-neutral spec §3.5 — Content Rules hold what a client's scripts rest on (what it sells, the
// claims it may use). Once a person has written or approved them, a re-extraction from documents
// must not replace them with a fresh draft, or with nothing.

/** `next` (a fresh extraction) with the previous version's Content Rules kept when a person edited
 *  or approved them; otherwise the fresh extraction's own. */
export function keepReviewedContentRules(next: TraceableBrandKB, previous: TraceableBrandKB | undefined): TraceableBrandKB {
  const kept = previous?.compliance?.content_rules;
  if (!kept || (kept.status !== "edited" && kept.status !== "approved")) return next;
  return { ...next, compliance: { ...next.compliance, content_rules: kept } };
}
