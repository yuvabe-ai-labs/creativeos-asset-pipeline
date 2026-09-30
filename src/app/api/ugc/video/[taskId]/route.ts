// UGC bench — poll a Seedance task. The browser polls: no Trigger.dev, works on localhost.
import { apiOk, withTryCatch, type RouteParams } from "@/lib/api/route-helpers";
import { getVideoTask } from "@/lib/ugc/client";

export async function GET(_req: Request, { params }: RouteParams<"taskId">) {
  return withTryCatch("Seedance poll failed", async () => {
    const { taskId } = await params;
    return apiOk(await getVideoTask(taskId));
  });
}
