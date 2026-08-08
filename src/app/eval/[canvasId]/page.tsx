import { ClipboardList } from "lucide-react";
import { listNodeTraces } from "@/lib/db/eval";
import { getCanvasById } from "@/lib/db/canvases";
import { getClientById } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import { EvalWorkbench } from "@/components/eval/eval-workbench";

export const dynamic = "force-dynamic";

// Eval error-analysis page (D94). Reads every generated node on the canvas + all its
// versions (cross-node query) and hands them to the list+detail workbench.
export default async function EvalReviewPage({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  const { canvasId } = await params;

  const effectiveOrgId = await resolveOrgId();
  const canvas = await getCanvasById(canvasId);
  const client = canvas ? await getClientById(canvas.client_id) : null;

  // Org isolation: a canvas outside the caller's org renders as not-found, never
  // confirming a foreign org's canvas exists — same rule as withCanvas() in
  // route-helpers.ts, applied here since this page bypasses that helper. Uses
  // resolveOrgId() (not caller.orgId) for consistency with withCanvas(), which
  // already resolves the impersonation target — an operator debugging a
  // customer's canvas via "view as" should see that customer's eval traces too.
  if (!canvas || !client || client.org_id !== effectiveOrgId) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-center">
        <ClipboardList className="mx-auto mb-3 size-8 text-muted-foreground/40" strokeWidth={1.5} />
        <p className="font-display text-lg font-medium">Canvas not found</p>
      </main>
    );
  }

  const traces = await listNodeTraces(canvasId);

  if (traces.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-center">
        <ClipboardList className="mx-auto mb-3 size-8 text-muted-foreground/40" strokeWidth={1.5} />
        <p className="font-display text-lg font-medium">No generated nodes on this canvas</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate on the canvas (or run the eval bootstrap), then reload this page.
        </p>
      </main>
    );
  }

  return <EvalWorkbench traces={traces} />;
}
