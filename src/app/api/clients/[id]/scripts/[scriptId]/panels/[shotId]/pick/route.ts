import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getScript } from "@/lib/db/scripts";
import { getPanelTake, setPanelPick } from "@/lib/db/script-panels";
import { isVisualiseStage } from "@/lib/scripts/visualise/cast";

type Ctx = { params: Promise<{ id: string; scriptId: string; shotId: string }> };

const Body = z.object({ takeId: z.uuid() });

// PUT /api/clients/:id/scripts/:scriptId/panels/:shotId/pick — D343: choose which drawn take of
// this shot is current. The client only ever sees the pick.
export async function PUT(req: Request, { params }: Ctx) {
  const { scriptId, shotId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not pick the take.", async () => {
      const body = Body.safeParse(await req.json().catch(() => null));
      if (!body.success) return apiError("Invalid request body.", 400);
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      if (!isVisualiseStage(script.stage)) {
        return apiError("Takes can be picked only while the script is in Visualise or In review.", 409);
      }
      const take = await getPanelTake(script.id, body.data.takeId);
      if (!take || take.shotId !== shotId || take.status !== "succeeded") {
        return apiError("No such take for this shot.", 404);
      }
      await setPanelPick(script.id, shotId, take.id);
      return apiOk({ pickId: take.id });
    }),
  );
}
