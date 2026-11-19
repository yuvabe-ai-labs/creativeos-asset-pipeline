import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getTurnTrace } from "@/lib/db/copilot-traces";

type Ctx = { params: Promise<{ id: string; traceId: string }> };

// GET /api/clients/:id/copilot/traces/:traceId — one copilot turn's whole trace (D509). Only a trace
// of this client: one of another client reads as gone.
export async function GET(req: Request, { params }: Ctx) {
  const { traceId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("The trace could not be loaded.", async () => {
      if (!z.string().uuid().safeParse(traceId).success) return apiError("That is not a trace.", 400);
      const found = await getTurnTrace(clientId, traceId);
      if (!found) return apiError("That trace is gone.", 404);
      return apiOk(found);
    }),
  );
}
