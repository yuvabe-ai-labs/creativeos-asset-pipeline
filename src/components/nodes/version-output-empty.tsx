// src/components/nodes/version-output-empty.tsx
import { XCircle } from "lucide-react";

/** D383 — the output column for a failed version. Never shows the raw error. */
export function VersionOutputEmpty({ noun }: { noun: string }) {
  return (
    <div className="flex size-full min-h-48 items-center justify-center rounded-xl border border-dashed border-border">
      <div className="px-8 text-center">
        <XCircle className="mx-auto size-8 text-destructive/60" strokeWidth={1.5} />
        <p className="mt-3 text-sm font-medium text-foreground">{`No ${noun} from this attempt`}</p>
        <p className="mt-1 text-xs text-muted-foreground">The generation did not finish.</p>
      </div>
    </div>
  );
}
