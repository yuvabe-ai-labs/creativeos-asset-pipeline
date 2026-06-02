"use server";

import { revalidatePath } from "next/cache";
import { createCanvas } from "@/lib/db/canvases";

export async function createCanvasAction(input: {
  clientId: string;
  clientSlug: string;
  name: string;
}) {
  const name = input.name?.trim();
  if (!name) throw new Error("Canvas needs a name");

  const canvas = await createCanvas({ clientId: input.clientId, name });

  revalidatePath(`/clients/${input.clientSlug}`);
  return canvas;
}
