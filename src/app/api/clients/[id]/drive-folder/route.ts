import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { updateClientDriveFolderId } from "@/lib/db/clients";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, (clientId) =>
    withTryCatch("Drive folder update failed", async () => {
      const body = await req.json().catch(() => null);
      const folderId =
        body && typeof body === "object" && "driveRootFolderId" in body
          ? body.driveRootFolderId
          : undefined;
      if (folderId !== null && typeof folderId !== "string") {
        return apiError("`driveRootFolderId` must be a string or null.", 400);
      }
      await updateClientDriveFolderId(clientId, folderId as string | null);
      return apiOk({ ok: true });
    }),
  );
}
