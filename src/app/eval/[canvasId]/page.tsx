import { ClipboardList } from "lucide-react";
import { listEvalTraces } from "@/lib/db/eval";
import { getCanvasById } from "@/lib/db/canvases";
import { getClientById } from "@/lib/db/clients";
import { resolveCallerContext } from "@/lib/dal";
import { ReviewScreen } from "@/components/eval/review-screen";

export const dynamic = "force-dynamic";

// Step-3 eval review page. Reads the eval canvas's traces (cross-node: prompt nodes +
// their active version) and hands them to the source-agnostic ReviewScreen.
export default async function EvalReviewPage({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  const { canvasId } = await params;
  const caller = await resolveCallerContext();
  const canvas = await getCanvasById(canvasId);
  const client = canvas ? await getClientById(canvas.client_id) : null;

  // Org isolation: a canvas outside the caller's org renders as not-found, never
  // confirming a foreign org's canvas exists — same rule as withCanvas() in
  // route-helpers.ts, applied here since this page bypasses that helper.
  if (!canvas || !client || client.org_id !== caller.orgId) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-center">
        <ClipboardList className="mx-auto mb-3 size-8 text-muted-foreground/40" strokeWidth={1.5} />
        <p className="font-display text-lg font-medium">Canvas not found</p>
      </main>
    );
  }

  const traces = await listEvalTraces(canvasId);

  if (traces.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-center">
        <ClipboardList className="mx-auto mb-3 size-8 text-muted-foreground/40" strokeWidth={1.5} />
        <p className="font-display text-lg font-medium">No eval traces on this canvas</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate traces with the bootstrap, then reload this page.
        </p>
      </main>
    );
  }

  return <ReviewScreen canvasId={canvasId} traces={traces} />;
}
