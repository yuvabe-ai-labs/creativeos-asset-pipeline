import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { approveKB } from "@/lib/kb/approve";

const bodySchema = z.object({ versionId: z.string().uuid().optional() });

// POST /api/clients/:id/kb/ready { versionId? } — a person approves the brand KB. Every field must
// be reviewed; the check is made on the server. `versionId`, when sent, is the KB the person was
// looking at: a rebuild they have not seen is never approved. The copilot's gate card sends none.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(req, params, { need: "edit" }, async (_clientId, client, caller) => {
    return withTryCatch("Failed to mark KB ready", async () => {
      const body = bodySchema.safeParse(await req.json().catch(() => ({})));
      if (!body.success) return apiError("Invalid request.", 400);
      const result = await approveKB({ client, userId: caller.userId, versionId: body.data.versionId });
      if ("error" in result) return apiError(result.error, 400);
      return apiOk({ ok: true as const });
    });
  });
}
