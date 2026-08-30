import { NextRequest } from "next/server";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { createSignal } from "@/lib/db/signals";
import { resolveCallerContext } from "@/lib/dal";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) => {
    let body: { name?: string; tags?: string[]; description?: string; itemIds?: string[] };
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    const name = body.name?.trim();
    if (!name) return apiError("name is required", 400);
    // A signal is born from selected evidence (PRD Flow C) — only later deletions
    // may empty it (D187).
    if (!Array.isArray(body.itemIds) || body.itemIds.length === 0) {
      return apiError("itemIds must be a non-empty array", 400);
    }
    const itemIds = body.itemIds;
    return withTryCatch("Could not create the signal.", async () => {
      const { userId } = await resolveCallerContext();
      const signal = await createSignal(clientId, {
        name,
        tags: Array.isArray(body.tags) ? body.tags : [],
        description: body.description?.trim() ?? "",
        createdBy: userId,
        itemIds,
      });
      return apiOk({ signal }, 201);
    });
  });
}
