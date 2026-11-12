import { revalidatePath } from "next/cache";
import { setMarketStatus } from "@/lib/db/clients";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";

// POST /api/clients/:id/market/approve
// A person approves the client's market research, which opens new scripts (copilot journey spec
// §5.2). Needs a ready brand KB. Approving twice is a no-op, so a double click never errors.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("Could not approve market research.", async () => {
      if (client.market_status === "approved") return apiOk({ ok: true as const });
      if (client.kb_status !== "ready") return apiError("Approve the brand KB before market research.", 409);

      await setMarketStatus(clientId, "approved");
      revalidatePath(`/clients/${client.slug}`);
      revalidatePath(`/clients/${client.slug}/market`);
      revalidatePath(`/clients/${client.slug}/scripts`);
      return apiOk({ ok: true as const });
    }),
  );
}
