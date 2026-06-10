import { resolvePromptInputs } from "@/lib/nodes/resolve-inputs";
import { compilePrompt } from "@/lib/nodes/prompt";
import { apiError, apiOk } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/compile-preview — resolve inputs + compile WITHOUT calling
// the model. Powers the live "final compiled prompt" panel (visible before generate).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  const body = (await req.json().catch(() => null)) as
    | { instruction?: unknown; slices?: unknown }
    | null;
  const instruction = typeof body?.instruction === "string" ? body.instruction : "";

  const resolved = await resolvePromptInputs(nodeId, body?.slices);
  if (!resolved) return apiError("Node not found.", 404);

  const { user } = compilePrompt({
    clientContext: resolved.clientContext,
    upstream: resolved.upstream,
    instruction,
  });

  return apiOk({
    compiled: user,
    upstream: resolved.upstream.map((u) => ({ nodeId: u.nodeId, label: u.label })),
  });
}
