"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/clients";
import { resolveCallerContext } from "@/lib/dal";

export async function createClientAction(input: { name: string }) {
  const name = input.name?.trim();
  if (!name) throw new Error("Client needs a name");

  const caller = await resolveCallerContext();
  const client = await createClient({ name, orgId: caller.orgId });
  revalidatePath("/");
  return client;
}
