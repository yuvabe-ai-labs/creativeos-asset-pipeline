"use client";

import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { dubLanguageLabel, dubStyleLabel, dubVoiceLabel } from "@/lib/dubbing/types";
import type { DubbingVersionSummary } from "@/hooks/use-dubbing-versions";

function Step({ done, label }: { done: boolean; label: string }) {
  const Icon = done ? Check : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", done ? "text-foreground" : "text-muted-foreground")}>
      <Icon className="size-3" strokeWidth={1.5} />{label}
    </span>
  );
}

// D375 — newest first; each row shows the three stages of one dub. Clicking makes it active.
export function DubbingVersionHistory({ versions, activeVersionId, onRestore, restoring }: {
  versions: DubbingVersionSummary[];
  activeVersionId: string | null;
  onRestore: (id: string) => void;
  restoring: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {versions.map((v, i) => {
        const d = v.dubbing;
        const active = v.id === activeVersionId;
        return (
          <Button
            key={v.id}
            variant="outline"
            disabled={restoring || active || !d}
            onClick={() => onRestore(v.id)}
            className={cn("h-auto w-full flex-col items-start gap-2 px-4 py-3 text-left", active && "border-primary")}
          >
            <span className="flex w-full items-center gap-2">
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">v{versions.length - i}</span>
              <span className="flex-1 text-sm font-medium">{d ? `${dubLanguageLabel(d.language)} dub${d.style ? ` · ${dubStyleLabel(d.style)}` : ""}${d.voice ? ` · ${dubVoiceLabel(d.voice)}` : ""}` : "Dub"}</span>
              {active && <span className="text-xs font-medium text-primary">Showing</span>}
              <span className="text-xs text-muted-foreground">{formatRelativeTime(v.createdAt)}</span>
            </span>
            <span className="flex gap-4">
              <Step done label="Original" />
              <Step done={Boolean(d?.dubbed)} label="Dubbed" />
              <Step done={Boolean(d?.lipSynced)} label="Lip-synced" />
            </span>
          </Button>
        );
      })}
    </div>
  );
}
