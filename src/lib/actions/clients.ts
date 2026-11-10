"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/clients";
import { withAction } from "@/lib/actions/with-action";

export async function createClientAction(input: { name: string }) {
  return withAction("createClientAction", { need: "clients.edit", on: "agency" }, async (ctx) => {
    const name = input.name?.trim();
    if (!name) throw new Error("Client needs a name");

    const orgId = ctx.effectiveOrgId;
    const client = await createClient({ name, orgId });
    revalidatePath("/");
    return client;
  });
}
