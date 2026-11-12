import "server-only";
import { notFound, redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import type { ClientRow } from "@/lib/db/types";
import type { CallerContext } from "@/lib/dal";
import { accessOf, resolveActingCaller } from "./server";
import { denialFor } from "./check";
import { resolveTarget } from "./targets";
import type { ClientScopedKey } from "./catalogue";

// Client pages (D496): another agency's client and a client outside the person's list both
// redirect home, as foreign clients always have; missing the area's view shows the 404 page.
export async function loadClientPage(
  slug: string,
  need: ClientScopedKey,
): Promise<{ client: ClientRow; caller: CallerContext; effectiveOrgId: string }> {
  const [client, acting] = await Promise.all([getClientBySlug(slug), resolveActingCaller()]);
  if (!client || client.org_id !== acting.effectiveOrgId) redirect("/");
  const denied = denialFor(accessOf(acting.caller), need, client.id);
  if (denied === "not_found") redirect("/");
  if (denied === "forbidden") notFound();
  return { client, caller: acting.caller, effectiveOrgId: acting.effectiveOrgId };
}

// Canvas pages outside the client tree (/eval/[canvasId]): another agency's canvas, a canvas
// outside the person's clients and a missing canvas all answer null, so the page shows its
// "Canvas not found"; missing the view shows the 404 page. One target read, beside the caller.
export async function loadCanvasPage(
  canvasId: string,
  need: ClientScopedKey,
): Promise<{ clientId: string; caller: CallerContext; effectiveOrgId: string } | null> {
  const [target, acting] = await Promise.all([resolveTarget({ canvasId }), resolveActingCaller()]);
  if (!target?.clientId || target.orgId !== acting.effectiveOrgId) return null;
  const denied = denialFor(accessOf(acting.caller), need, target.clientId);
  if (denied === "not_found") return null;
  if (denied === "forbidden") notFound();
  return { clientId: target.clientId, caller: acting.caller, effectiveOrgId: acting.effectiveOrgId };
}
