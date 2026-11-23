import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { updateSignal, deleteSignal } from "@/lib/db/signals";

type Params = { params: Promise<{ id: string; signalId: string }> };

// The chokepoint checks the client in the URL; the signal id beside it is tied to that client in
// the write itself, so another client's signal matches nothing and answers 404.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, signalId } = await params;
  return withClient(req, Promise.resolve({ id }), { need: "edit" }, async (clientId) => {
    let body: { name?: string; tags?: string[]; description?: string };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    if (body.name !== undefined && !body.name.trim()) return apiError("name cannot be empty", 400);
    return withTryCatch("Could not update the signal.", async () => {
      const found = await updateSignal(clientId, signalId, {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
      });
      if (!found) return apiError("Signal not found.", 404);
      return apiOk({ ok: true });
    });
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id, signalId } = await params;
  return withClient(req, Promise.resolve({ id }), { need: "delete" }, async (clientId) =>
    withTryCatch("Could not delete the signal.", async () => {
      if (!(await deleteSignal(clientId, signalId))) return apiError("Signal not found.", 404);
      return apiOk({ ok: true });
    }),
  );
}
