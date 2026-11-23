import { apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { loadThread } from "@/lib/journey/thread/load";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/clients/:id/copilot/thread — the client's saved onboarding thread, what is running
// right now, and the reply choices. The one read of the thread for every stage page; the panel
// polls it only while something is running. Sending a message is per stage (./kb/turn).
export async function GET(req: Request, { params }: Ctx) {
  return withClient(req, params, { need: "view" }, async (_clientId, client) =>
    withTryCatch("The copilot could not be loaded.", async () => apiOk(await loadThread(client))),
  );
}
