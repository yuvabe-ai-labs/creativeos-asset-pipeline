"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import { withAction } from "@/lib/actions/with-action";

export async function createClientAction(input: { name: string }) {
  return withAction("createClientAction", async () => {
    const name = input.name?.trim();
    if (!name) throw new Error("Client needs a name");

    const orgId = await resolveOrgId();
    const client = await createClient({ name, orgId });
    revalidatePath("/");
    return client;
  });
}
