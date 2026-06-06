"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/clients";

export async function createClientAction(input: { name: string }) {
  const name = input.name?.trim();
  if (!name) throw new Error("Client needs a name");

  const client = await createClient({ name });
  revalidatePath("/");
  return client;
}
