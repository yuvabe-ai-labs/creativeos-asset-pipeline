"use server";

import { revalidatePath } from "next/cache";
import { createCanvas, renameCanvas, deleteCanvas } from "@/lib/db/canvases";
import { getActiveKBVersion } from "@/lib/db/kb";
import { saveCanvasNodes } from "@/lib/db/nodes";
import { saveCanvasEdges } from "@/lib/db/edges";
import { resolveCallerContext } from "@/lib/dal";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { withAction } from "@/lib/actions/with-action";

export async function createCanvasAction(input: {
  clientId: string;
  clientSlug: string;
  name: string;
}) {
  return withAction("createCanvasAction", async () => {
    const name = input.name?.trim();
    if (!name) throw new Error("Canvas needs a name");

    const caller = await resolveCallerContext();
    const canvas = await createCanvas({ clientId: input.clientId, orgId: caller.orgId, name });

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
  });
}

export async function renameCanvasAction(input: {
  canvasId: string;
  clientSlug: string;
  name: string;
}): Promise<void> {
  return withAction("renameCanvasAction", async () => {
    const name = input.name?.trim();
    if (!name) throw new Error("Canvas needs a name");
    if (name.length > 100) throw new Error("Canvas name is too long (max 100 characters)");
    await renameCanvas(input.canvasId, name);
    revalidatePath(`/clients/${input.clientSlug}`);
  });
}

export async function deleteCanvasAction(input: {
  canvasId: string;
  clientSlug: string;
}): Promise<void> {
  return withAction("deleteCanvasAction", async () => {
    await deleteCanvas(input.canvasId);
    revalidatePath(`/clients/${input.clientSlug}`);
  });
}
