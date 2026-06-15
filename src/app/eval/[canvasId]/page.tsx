import { ClipboardList } from "lucide-react";
import { listEvalTraces } from "@/lib/db/eval";
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
