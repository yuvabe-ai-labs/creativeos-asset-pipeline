import Link from "next/link";
import type { UnwrittenScript } from "@/lib/scripts/copilot/schema";
import { ScriptStageBadge } from "./script-stage-badge";

/** A script whose first draft is not written yet: the copilot is still gathering its brief. */
export function ScriptUnwrittenCard({ script, href }: { script: UnwrittenScript; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-card p-5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">New script</span>
        <ScriptStageBadge stage="generate" />
      </div>
      <span className="font-display text-lg font-medium leading-tight text-foreground">{script.title}</span>
      <span className="border-t border-border pt-3 text-sm text-muted-foreground">Not written yet: the copilot is gathering the brief.</span>
    </Link>
  );
}
