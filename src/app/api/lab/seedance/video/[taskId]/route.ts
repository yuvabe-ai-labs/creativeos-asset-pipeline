// EXPERIMENT (throwaway) — poll a Seedance task, step 3 of the probe.
// Client-side polling on purpose: Trigger.dev async video never completes against
// localhost, and this experiment must be runnable locally.
import { apiOk, withTryCatch, type RouteParams } from "@/lib/api/route-helpers";
import { getVideoTask } from "@/lib/lab/seedance/client";

export async function GET(_req: Request, { params }: RouteParams<"taskId">) {
  return withTryCatch("Seedance poll failed", async () => {
    const { taskId } = await params;
    const result = await getVideoTask(taskId);
    return apiOk(result);
  });
}
