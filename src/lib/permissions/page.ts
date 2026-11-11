import "server-only";
import { notFound, redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import type { ClientRow } from "@/lib/db/types";
import type { CallerContext } from "@/lib/dal";
import { accessOf, resolveActingCaller } from "./server";
import { denialFor } from "./check";
import type { ClientScopedKey } from "./catalogue";

// Client pages (D490): another agency's client and a client outside the person's list both
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
