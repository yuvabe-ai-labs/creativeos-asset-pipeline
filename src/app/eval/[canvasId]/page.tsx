import { ClipboardList } from "lucide-react";
import { listNodeTraces } from "@/lib/db/eval";
import { EvalWorkbench } from "@/components/eval/eval-workbench";

export const dynamic = "force-dynamic";

// Eval error-analysis page (D35). Reads every generated node on the canvas + all its
// versions (cross-node query) and hands them to the list+detail workbench.
export default async function EvalReviewPage({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  const { canvasId } = await params;
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
