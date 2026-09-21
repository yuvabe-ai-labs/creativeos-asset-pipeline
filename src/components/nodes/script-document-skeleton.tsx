import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder for a script being extracted or re-extracted. Mirrors
 *  `ScriptDocument`'s own geometry — same `max-w-[78ch]`, same 160px label
 *  column, same section rhythm — so the real document lands in the space the
 *  skeleton was already holding instead of shifting the page. Re-extraction in
 *  particular replaces a document the designer is already reading, which is why
 *  it earns a shaped placeholder rather than a centred spinner. */
export function ScriptDocumentSkeleton({
  shots = 4,
  reextracting = false,
}: {
  shots?: number;
  reextracting?: boolean;
}) {
  return (
    <div className="grid max-w-[78ch] gap-12" aria-busy aria-live="polite">
      {/* Says which of the two things is happening: a first read, or a re-read
          that is about to replace a document already on screen. */}
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 aria-hidden className="size-4 animate-spin text-primary" strokeWidth={1.5} />
        {reextracting ? "Reading the script again…" : "Reading the script…"}
      </p>

      {/* title + eyebrow */}
      <div className="grid gap-3">
        <Skeleton className="h-8 w-[22ch]" />
        <Skeleton className="h-3 w-[30ch]" />
      </div>

      {/* two short sections above the featured one */}
      {[0, 1].map((i) => (
        <Row key={i} lines={2} />
      ))}

      {/* the visual script — the tall, featured block */}
      <section className="grid gap-2.5 sm:grid-cols-[160px_1fr] sm:gap-x-10">
        <Label />
        <div className="grid gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-card">
          {Array.from({ length: shots }, (_, i) => (
            <div key={i} className="grid gap-2 border-l-2 border-border/60 pl-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[85%]" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </section>

      {/* the remaining sections */}
      {[0, 1, 2].map((i) => (
        <Row key={i} lines={i === 1 ? 3 : 2} />
      ))}
    </div>
  );
}

function Label() {
  return (
    <div className="self-start">
      <Skeleton className="mb-2 h-0.5 w-6" />
      <Skeleton className="h-3 w-[11ch]" />
    </div>
  );
}

function Row({ lines }: { lines: number }) {
  return (
    <section className="grid gap-2.5 sm:grid-cols-[160px_1fr] sm:gap-x-10">
      <Label />
      <div className="grid gap-2">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={i === lines - 1 ? "h-4 w-[60%]" : "h-4 w-full"} />
        ))}
      </div>
    </section>
  );
}
