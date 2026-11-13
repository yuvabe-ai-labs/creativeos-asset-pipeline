import { ClipboardList } from "lucide-react";
import { listNodeTraces } from "@/lib/db/eval";
import { loadCanvasPage } from "@/lib/permissions/page";
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

  // Another agency's canvas, or one outside the person's clients, renders as not found and
  // never confirms it exists (D496). Checked in the agency being acted in, so an operator
  // using "view as" sees that agency's eval traces. Missing canvas view shows the 404 page.
  const page = await loadCanvasPage(canvasId, "view");
  if (!page) {
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
