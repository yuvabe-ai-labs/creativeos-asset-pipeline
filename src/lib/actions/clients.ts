"use server";

import { revalidatePath } from "next/cache";
import { createClient, addClientToMembership, deleteClient } from "@/lib/db/clients";
import { accessOf } from "@/lib/permissions/server";
import { withAction } from "@/lib/actions/with-action";

export async function createClientAction(input: { name: string }) {
  return withAction("createClientAction", { need: "clients.edit", on: "agency" }, async (ctx) => {
    const name = input.name?.trim();
    if (!name) throw new Error("Client needs a name");

    const orgId = ctx.effectiveOrgId;
    const client = await createClient({ name, orgId });
    if (accessOf(ctx.caller).clientScope !== "all") {
      try {
        await addClientToMembership(ctx.caller.userId, orgId, client.id);
      } catch (err) {
        // Don't leave an orphan the creator can't open (mirrors addOrgMember's own rollback).
        try {
          await deleteClient(client.id);
        } catch (e) {
          console.error("[createClientAction] rollback failed", e);
        }
        throw err;
      }
    }
    revalidatePath("/");
    return client;
  });
}
