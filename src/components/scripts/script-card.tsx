import Link from "next/link";
import type { Script } from "@/lib/scripts/schema";
import type { ScriptDeleteBlock } from "@/lib/scripts/constants";
import { headerLine, reelLabel, shotSummary } from "@/lib/scripts/utils";
import { ClientFeedbackCount } from "@/components/script-review/client-feedback-count";
import { ScriptStageBadge } from "./script-stage-badge";
import { DeleteScriptButton } from "./delete-script-button";

/** The title's link stretches over the whole card (its ::after), so Delete (D384) can sit on top of
 *  it without nesting a button inside a link, as ScriptUnwrittenCard does. */
export function ScriptCard({ clientId, script, href, feedbackCount = 0, deleteBlock = null }: {
  clientId: string;
  script: Script;
  href: string;
  feedbackCount?: number;
  deleteBlock?: ScriptDeleteBlock | null;
}) {
  const { header } = script.doc;
  return (
    <div className="relative flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006] has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{reelLabel(header.reelNumber) ?? "Reel"}</span>
        <ScriptStageBadge stage={script.stage} />
      </div>
      <div className="flex flex-col gap-1">
        <Link
          href={href}
          className="font-display text-lg font-medium leading-tight text-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
        >
          {header.title}
        </Link>
        <span className="text-sm text-muted-foreground">{headerLine(header)}</span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-sm text-muted-foreground">{shotSummary(script.doc)}</span>
        <div className="flex items-center gap-2">
          <ClientFeedbackCount count={feedbackCount} />
          <DeleteScriptButton
            clientId={clientId}
            scriptId={script.id}
            title={header.title}
            block={deleteBlock}
            className="relative z-10 -my-1 shrink-0"
          />
        </div>
      </div>
    </div>
  );
}
