import { Clapperboard, Sparkles } from "lucide-react";
import type { EvalTrace } from "@/lib/db/eval";

// Layout B body: the source shot (input) on top, the generated image prompt (output)
// below. Read-only — labelling lives in the sticky LabelBar.
export function TracePanels({ trace }: { trace: EvalTrace }) {
  return (
    <div className="mx-auto flex h-full w-full min-h-0 max-w-4xl flex-col gap-3 px-6 py-4">
      {/* Source shot — compact reference, capped height with its own scroll */}
      <section className="mt-2 max-h-[42vh] shrink-0 overflow-y-auto rounded-xl border border-border bg-card px-8 py-7 shadow-card">
        <div className="mb-2.5 flex items-center gap-1.5">
          <Clapperboard className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Source shot · input</span>
        </div>
        <pre className="whitespace-pre-wrap font-sans text-sm font-medium leading-relaxed text-foreground/90">
          {trace.shotText || "—"}
        </pre>
      </section>

      {/* Generated prompt — the thing under review, takes the remaining space */}
      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card px-8 py-7 shadow-card">
        <div className="mb-2 flex shrink-0 items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Generated image prompt · output</span>
        </div>
        <p className="min-h-0 flex-1 overflow-y-auto text-sm leading-relaxed text-foreground/90">
          {trace.prompt || "—"}
        </p>
      </section>
    </div>
  );
}
