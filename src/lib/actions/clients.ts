"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/clients";
import { withAction } from "@/lib/actions/with-action";

// Creating clients is the owner's (manage_clients, spec §2.2). The owner is on every client
// already, so a new client needs no membership row.
export async function createClientAction(input: { name: string }) {
  return withAction("createClientAction", { need: "manage_clients", on: "agency" }, async (ctx) => {
    const name = input.name?.trim();
    if (!name) throw new Error("Client needs a name");
    const client = await createClient({ name, orgId: ctx.effectiveOrgId });
    revalidatePath("/");
    return client;
  });
}
