import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { listKBDocuments } from "@/lib/db/kb";
import { startKbProposal } from "@/lib/kb/changes/start";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /** Documents just added in Source files. */
  added: z.array(z.string().uuid()).max(50),
  /** File names of documents just removed there: already deleted, so only their names remain. */
  removed: z.array(z.string().min(1).max(300)).max(50),
});

// POST /api/clients/:id/kb/propose { added, removed } — what "Save & re-analyze" in Source files
// does now (brand KB spec §2.5, D517): the copilot reads the change against the brand KB and
// answers in the thread with a change card. Nothing is rebuilt, no review is wiped and the KB's
// status is never touched. Images are not read here: they are studied as they are uploaded.
export async function POST(req: Request, { params }: Ctx) {
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("Could not read the changes.", async () => {
      const body = bodySchema.safeParse(await req.json().catch(() => null));
      if (!body.success) return apiError("Nothing to read.", 400);
      if (!client.active_kb_version_id) return apiError("There is no brand KB to change yet.", 409);
      const { added, removed } = body.data;
      if (added.length === 0 && removed.length === 0) return apiOk({ started: false });

      const [{ userId }, docs] = await Promise.all([resolveCallerContext(), listKBDocuments(clientId)]);
      // The ids come from the browser: each must be one of this client's documents, and is named
      // from what is stored, never from what the browser sent.
      const byId = new Map(docs.map((d) => [d.id, d.filename]));
      if (!added.every((id) => byId.has(id))) return apiError("That document does not belong to this client.", 400);

      await startKbProposal(clientId, userId, { added: added.map((id) => ({ id, name: byId.get(id) as string })), removed });
      return apiOk({ started: true });
    }),
  );
}
