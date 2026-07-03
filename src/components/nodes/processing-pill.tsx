import { Loader2 } from "lucide-react";

/**
 * Header chip shown on a generating node's card while it is processing.
 * Replaces the static status dot. Renders nothing when not processing, so
 * callers can place it alongside their normal dot:
 *   <ProcessingPill processing={isProcessing} />
 *   {!isProcessing && <span className="size-1.5 rounded-full …" />}
 */
export function ProcessingPill({ processing }: { processing: boolean }) {
  if (!processing) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-primary/5 px-1.5 py-0.5 text-primary">
      <Loader2 className="size-3 animate-spin stroke-[1.5]" />
      <span className="text-eyebrow !text-[0.6rem]">Processing</span>
    </span>
  );
}
