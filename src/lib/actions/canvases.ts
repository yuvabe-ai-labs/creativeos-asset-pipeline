"use server";

import { revalidatePath } from "next/cache";
import { createCanvas } from "@/lib/db/canvases";
import { getActiveKBVersion } from "@/lib/db/kb";
import { saveCanvasNodes } from "@/lib/db/nodes";
import { saveCanvasEdges } from "@/lib/db/edges";
import type { TraceableBrandKB } from "@/lib/kb/schema";

export async function createCanvasAction(input: {
  clientId: string;
  clientSlug: string;
  name: string;
}) {
  const name = input.name?.trim();
  if (!name) throw new Error("Canvas needs a name");

  const canvas = await createCanvas({ clientId: input.clientId, name });

  // If the client has an active KB, seed a KB node + a connected Brief node.
  const activeKB = await getActiveKBVersion(input.clientId);
  if (activeKB) {
    const kb = activeKB.output as TraceableBrandKB;
    const kbNodeId = crypto.randomUUID();
    const scriptNodeId = crypto.randomUUID();

    await saveCanvasNodes(canvas.id, [
      {
        id: kbNodeId,
        type: "kb",
        position: { x: 80, y: 120 },
        data: {
          clientId: input.clientId,
          clientSlug: input.clientSlug,
          kbVersionId: activeKB.id,
          brandName: kb.brand?.value ?? kb.brand_profile?.brand_name?.value ?? null,
          fillRate: activeKB.fill_rate,
          extractedAt: activeKB.created_at,
        },
      },
      {
        id: scriptNodeId,
        type: "script",
        position: { x: 360, y: 120 },
        data: { title: "" },
      },
    ]);

    await saveCanvasEdges(canvas.id, [
      {
        id: crypto.randomUUID(),
        source: kbNodeId,
        target: scriptNodeId,
      },
    ]);
  }

  revalidatePath(`/clients/${input.clientSlug}`);
  return canvas;
}
