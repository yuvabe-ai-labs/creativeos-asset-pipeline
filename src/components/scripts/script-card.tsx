import Link from "next/link";
import type { Script } from "@/lib/scripts/schema";
import { headerLine, reelLabel, shotSummary } from "@/lib/scripts/utils";
import { ScriptStageBadge } from "./script-stage-badge";

export function ScriptCard({ script, href }: { script: Script; href: string }) {
  const { header } = script.doc;
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{reelLabel(header.reelNumber) ?? "Reel"}</span>
        <ScriptStageBadge stage={script.stage} />
      </div>
      <div className="flex flex-col gap-1">
        <span className="font-display text-lg font-medium leading-tight text-foreground">{header.title}</span>
        <span className="text-sm text-muted-foreground">{headerLine(header)}</span>
      </div>
      <span className="border-t border-border pt-3 text-sm text-muted-foreground">{shotSummary(script.doc)}</span>
    </Link>
  );
}
