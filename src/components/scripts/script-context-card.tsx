import type { ScriptDoc } from "@/lib/scripts/schema";
import type { ScriptStage } from "@/lib/scripts/constants";
import { headerLine, reelLabel, shotSummary } from "@/lib/scripts/utils";
import { ScriptStageBadge } from "./script-stage-badge";
import { SCRIPT_CONTEXT_ANCHOR } from "@/lib/scripts/anchors";

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-eyebrow">{label}</span>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

export function ScriptContextCard({ doc, stage }: { doc: ScriptDoc; stage: ScriptStage }) {
  const { header, context } = doc;
  const facts = [headerLine(header), header.theme, [header.aspect, header.targetLength].filter(Boolean).join(", "), header.production]
    .filter(Boolean)
    .join(" · ");
  return (
    <section id={SCRIPT_CONTEXT_ANCHOR} aria-label="Context" className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{reelLabel(header.reelNumber)}</span>
          <h1 className="font-display text-2xl font-medium">{header.title}</h1>
          <span className="text-sm text-muted-foreground">{facts}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{shotSummary(doc)}</span>
          <ScriptStageBadge stage={stage} />
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {context.purpose && <Section label="Purpose">{context.purpose}</Section>}
        {context.settingAndCamera && <Section label="Setting and camera">{context.settingAndCamera}</Section>}
      </div>
      {(context.disclaimers || context.watchOuts.length > 0) && (
        <div className="grid gap-5 border-t border-border pt-5 md:grid-cols-2">
          {context.disclaimers && <Section label="Disclaimers">{context.disclaimers}</Section>}
          {context.watchOuts.length > 0 && (
            <Section label="Watch-outs">
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {context.watchOuts.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </Section>
          )}
        </div>
      )}
    </section>
  );
}
