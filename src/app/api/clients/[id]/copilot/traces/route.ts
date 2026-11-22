import { apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { listTurnLines } from "@/lib/db/copilot-traces";
import { TRACE_KEEP_DAYS, TRACE_LIST_LIMIT } from "@/lib/journey/kb-copilot/constants";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/clients/:id/copilot/traces — the client's recent copilot turns, one line each, newest
// first (turn traces, D521). Lines only: a whole trace is read when one is opened (./[traceId]).
// Anything older than the keep period is left out, so a late sweep never shows a stale trace.
export async function GET(req: Request, { params }: Ctx) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("The turns could not be loaded.", async () => {
      const since = new Date(Date.now() - TRACE_KEEP_DAYS * 86_400_000).toISOString();
      return apiOk({ lines: await listTurnLines(clientId, since, TRACE_LIST_LIMIT) });
    }),
  );
}
