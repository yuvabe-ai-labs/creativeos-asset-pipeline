import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { updateSignal, deleteSignal } from "@/lib/db/signals";

type Params = { params: Promise<{ id: string; signalId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, signalId } = await params;
  return withClient(req, Promise.resolve({ id }), async () => {
    let body: { name?: string; tags?: string[]; description?: string };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    if (body.name !== undefined && !body.name.trim()) return apiError("name cannot be empty", 400);
    return withTryCatch("Could not update the signal.", async () => {
      await updateSignal(signalId, {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      });
      return apiOk({ ok: true });
    });
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id, signalId } = await params;
  return withClient(req, Promise.resolve({ id }), async () =>
    withTryCatch("Could not delete the signal.", async () => {
      await deleteSignal(signalId);
      return apiOk({ ok: true });
    }),
  );
}
