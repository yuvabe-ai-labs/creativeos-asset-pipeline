import { Clapperboard, Sparkles } from "lucide-react";
import type { EvalTrace } from "@/lib/db/eval";

// Layout B body: the source shot (input) on top, the generated image prompt (output)
// below. Read-only — labelling lives in the sticky LabelBar.
export function TracePanels({ trace }: { trace: EvalTrace }) {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-6 py-6">
      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="mb-2.5 flex items-center gap-1.5">
          <Clapperboard className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Source shot · input</span>
        </div>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
          {trace.shotText || "—"}
        </pre>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="mb-2.5 flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Generated image prompt · output</span>
        </div>
        <p className="text-sm leading-relaxed text-foreground/90">{trace.prompt || "—"}</p>
      </section>
    </div>
  );
}
