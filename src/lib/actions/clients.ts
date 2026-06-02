"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/clients";

// Server Action: the browser calls this like a function; Next wires the POST.
// It runs on the server, so it can touch the DB (and revalidate the list).
export async function createClientAction(input: {
  name: string;
  logo?: string | null;
  contextNotes?: string;
}) {
  const name = input.name?.trim();
  if (!name) throw new Error("Client needs a name");

  const client = await createClient({
    name,
    logo: input.logo ?? null,
    contextNotes: input.contextNotes ?? "",
  });

  revalidatePath("/"); // tell Next the clients list is now stale
  return client;
}
