import Link from "next/link";
import type { UnwrittenScript } from "@/lib/scripts/copilot/schema";
import { ScriptStageBadge } from "./script-stage-badge";
import { DeleteScriptButton } from "./delete-script-button";

/** A script whose first draft is not written yet: the copilot is still gathering its brief. The
 *  title's link stretches over the whole card (its ::after), so Delete can sit on top of it
 *  without nesting a button inside a link. */
export function ScriptUnwrittenCard({ clientId, script, href }: { clientId: string; script: UnwrittenScript; href: string }) {
  return (
    <div className="relative flex flex-col gap-3 rounded-xl border border-dashed border-border bg-card p-5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">New script</span>
        <ScriptStageBadge stage="generate" />
      </div>
      <Link
        href={href}
        className="font-display text-lg font-medium leading-tight text-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
      >
        {script.title}
      </Link>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-sm text-muted-foreground">Not written yet: the copilot is gathering the brief.</span>
        <DeleteScriptButton clientId={clientId} scriptId={script.id} title={script.title} className="relative z-10 -my-1 shrink-0" />
      </div>
    </div>
  );
}
