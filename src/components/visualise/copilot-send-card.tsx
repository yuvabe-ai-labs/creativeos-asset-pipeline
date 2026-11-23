"use client";

import { ShareDialog } from "@/components/script-review/team/share-dialog";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import type { Script } from "@/lib/scripts/schema";

/** Piece 5.1 §3.5 — the copilot's send card. Always offered; it names what is missing and never
 *  blocks. Its button is the page's own Move to In review, which also shares (D349, refined). */
export function CopilotSendCard({ clientId, script, latest, missing }: {
  clientId: string;
  script: Script;
  latest: TeamScriptReview["latest"];
  missing: string[];
}) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-background p-3 text-sm">
      <div className="flex flex-col gap-1">
        <span className="text-eyebrow">Send for client review</span>
        {missing.length === 0 ? (
          <span className="text-muted-foreground">Nothing is missing.</span>
        ) : (
          <ul className="flex flex-col gap-1 text-muted-foreground">
            {missing.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
      </div>
      <div className="self-start">
        <ShareDialog clientId={clientId} script={script} latest={latest} moving />
      </div>
    </div>
  );
}
