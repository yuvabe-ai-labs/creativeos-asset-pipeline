"use server";

import { revalidatePath } from "next/cache";
import { createCanvas, renameCanvas, deleteCanvas, getScriptCanvas } from "@/lib/db/canvases";
import { getActiveKBVersion } from "@/lib/db/kb";
import { saveCanvasNodes } from "@/lib/db/nodes";
import { saveCanvasEdges } from "@/lib/db/edges";
import { getScript } from "@/lib/db/scripts";
import { getClientById } from "@/lib/db/clients";
import type { CanvasRow } from "@/lib/db/types";
import { resolveOrgId } from "@/lib/dal";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { withAction } from "@/lib/actions/with-action";

/** A new canvas starts with the client's KB node wired to an empty Script node, when there is a KB. */
async function seedCanvas(canvasId: string, clientId: string, clientSlug: string): Promise<void> {
  const activeKB = await getActiveKBVersion(clientId);
  if (!activeKB) return;
  const kb = activeKB.output as TraceableBrandKB;
  const kbNodeId = crypto.randomUUID();
  const scriptNodeId = crypto.randomUUID();

  await saveCanvasNodes(canvasId, [
    {
      id: kbNodeId,
      type: "kb",
      position: { x: 80, y: 120 },
      data: {
        clientId,
        clientSlug,
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

  await saveCanvasEdges(canvasId, [
    {
      id: crypto.randomUUID(),
      source: kbNodeId,
      target: scriptNodeId,
    },
  ]);
}

export async function createCanvasAction(input: {
  clientId: string;
  clientSlug: string;
  name: string;
}) {
  return withAction("createCanvasAction", async () => {
    const name = input.name?.trim();
    if (!name) throw new Error("Canvas needs a name");

    const orgId = await resolveOrgId();
    const canvas = await createCanvas({ clientId: input.clientId, orgId, name });
    await seedCanvas(canvas.id, input.clientId, input.clientSlug);

    revalidatePath(`/clients/${input.clientSlug}`);
    return canvas;
  });
}

/** D371 — "Create canvas" on an approved script: the script's canvas, made now or already there.
 *  One canvas per script; a racing second request gets the first one's canvas (unique index). The
 *  canvas is seeded as any new canvas is; the script itself is added on the canvas, which fills
 *  the seeded empty Script node (AddScriptFromUrl), so it parses with the lead's avatar attached. */
export async function createCanvasFromScriptAction(input: {
  clientId: string;
  clientSlug: string;
  scriptId: string;
  name: string;
}): Promise<{ canvas: CanvasRow; created: boolean }> {
  return withAction("createCanvasFromScriptAction", async () => {
    const name = input.name?.trim();
    if (!name) throw new Error("Canvas needs a name");
    // The client id comes from the browser and these reads use the service role (no RLS): a
    // client outside the caller's org is "not found", before anything of it is read or linked.
    const orgId = await resolveOrgId();
    const client = await getClientById(input.clientId);
    if (!client || client.org_id !== orgId) throw new Error("Client not found.");
    const script = await getScript(input.clientId, input.scriptId);
    if (!script || script.stage !== "approved") throw new Error("Only an approved script can start a canvas.");
    const existing = await getScriptCanvas(input.clientId, input.scriptId);
    if (existing) return { canvas: existing, created: false };

    let canvas: CanvasRow;
    try {
      canvas = await createCanvas({ clientId: input.clientId, orgId, name, sourceScriptId: input.scriptId });
    } catch (e) {
      const raced = await getScriptCanvas(input.clientId, input.scriptId);
      if (raced) return { canvas: raced, created: false };
      throw e;
    }
    await seedCanvas(canvas.id, input.clientId, input.clientSlug);
    revalidatePath(`/clients/${input.clientSlug}`);
    revalidatePath(`/clients/${input.clientSlug}/scripts/${input.scriptId}`);
    return { canvas, created: true };
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
