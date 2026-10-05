import { revalidatePath } from "next/cache";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { renameClient } from "@/lib/db/clients";
import { CLIENT_NAME_MAX_LENGTH } from "@/lib/clients/constants";

// PATCH /api/clients/:id/name — rename a client. Body: { name: string }. The slug is unchanged.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, (clientId) =>
    withTryCatch("Could not rename the client.", async () => {
      const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      if (!name) return apiError("A client needs a name.", 400);
      if (name.length > CLIENT_NAME_MAX_LENGTH) {
        return apiError(`Keep the name under ${CLIENT_NAME_MAX_LENGTH} characters.`, 400);
      }
      await renameClient(clientId, name);
      // The clients list renders the name server-side.
      revalidatePath("/");
      return apiOk({ name });
    }),
  );
}
