import {
  apiError,
  apiOk,
  withClient,
  withTryCatch,
} from "@/lib/api/route-helpers";
import { setClientArchived } from "@/lib/db/clients";
import { parseArchivedBody } from "@/lib/clients/parse-archived-body";

// PATCH /api/clients/:id — archive or unarchive a client. Body: { archived: boolean }.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, (clientId) =>
    withTryCatch("Archive update failed", async () => {
      const archived = parseArchivedBody(await req.json().catch(() => null));
      if (archived === null) {
        return apiError("`archived` must be a boolean.", 400);
      }
      await setClientArchived(clientId, archived);
      return apiOk({ ok: true });
    }),
  );
}
