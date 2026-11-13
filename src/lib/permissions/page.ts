import "server-only";
import { notFound } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import type { ClientRow } from "@/lib/db/types";
import type { CallerContext } from "@/lib/dal";
import { accessOf, resolveActingCaller } from "./server";
import { check } from "./check";
import { actionForNeed, type Need } from "./legacy-need";
import { resolveTarget } from "./targets";

// Client pages (spec §4.4): another agency's client, a client the person is not on or can't
// view, and a missing permission all show the 404 page, which never confirms the client exists.
export async function loadClientPage(
  slug: string,
  need: Need,
): Promise<{ client: ClientRow; caller: CallerContext; effectiveOrgId: string }> {
  const [client, acting] = await Promise.all([getClientBySlug(slug), resolveActingCaller()]);
  if (!client || client.org_id !== acting.effectiveOrgId) notFound();
  const decision = check(accessOf(acting.caller), actionForNeed(need), { orgId: acting.effectiveOrgId, clientId: client.id });
  if (decision !== "allow") notFound();
  return { client, caller: acting.caller, effectiveOrgId: acting.effectiveOrgId };
}

// Canvas pages outside the client tree (/eval/[canvasId]): another agency's canvas, a canvas on a
// client the person can't view and a missing canvas answer null, so the page shows its own
// "Canvas not found"; a missing permission shows the 404 page. One target read, beside the caller.
export async function loadCanvasPage(
  canvasId: string,
  need: Need,
): Promise<{ clientId: string; caller: CallerContext; effectiveOrgId: string } | null> {
  const [target, acting] = await Promise.all([resolveTarget({ canvasId }), resolveActingCaller()]);
  if (!target?.clientId || target.orgId !== acting.effectiveOrgId) return null;
  const decision = check(accessOf(acting.caller), actionForNeed(need), { orgId: acting.effectiveOrgId, clientId: target.clientId });
  if (decision === "not_found") return null;
  if (decision === "forbidden") notFound();
  return { clientId: target.clientId, caller: acting.caller, effectiveOrgId: acting.effectiveOrgId };
}
