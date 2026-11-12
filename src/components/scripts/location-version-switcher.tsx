"use client";

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LocationVersion } from "@/lib/scripts/schema";

/** How a version came to be, in a few words. */
function versionLabel(v: LocationVersion): string {
  if (v.source === "plate") {
    if (v.mode === "change") return v.note ? `Changed: ${v.note}` : "Changed";
    return v.note ? `Drawn: ${v.note}` : "Drawn";
  }
  if (v.source === "upload") return "Uploaded";
  if (v.source === "brand-kit") return "From the brand kit";
  if (v.source === "kb") return "From the KB";
  return "Generated";
}

/**
 * D489 — steps through a location's past plates. Stepping only shows a plate on the card; "Use this
 * version" makes it the location's plate again (no new version: it is one the location held).
 */
export function LocationVersionSwitcher({
  versions,
  shownUrl,
  currentUrl,
  onShow,
  onUse,
}: {
  versions: LocationVersion[];
  /** The plate the card shows now: the current one, or the one being looked at. */
  shownUrl: string | null;
  /** The location's plate; null after Clear. */
  currentUrl: string | null;
  onShow: (url: string) => void;
  onUse: (version: LocationVersion) => void;
}) {
  const found = versions.findIndex((v) => v.url === shownUrl);
  // Nothing shown (a cleared plate): the arrows start from the newest.
  const index = found >= 0 ? found : versions.length;
  const shown = found >= 0 ? versions[found] : null;
  const isCurrent = shown !== null && shown.url === currentUrl;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-xs" aria-label="Earlier version" disabled={index <= 0}
          onClick={() => onShow(versions[index - 1].url)}>
          <ChevronLeft className="size-3.5" strokeWidth={1.5} />
        </Button>
        <span className="tabular-nums" aria-live="polite">
          {shown ? `v${found + 1} of ${versions.length}` : `${versions.length} versions`}
        </span>
        <Button variant="ghost" size="icon-xs" aria-label="Later version" disabled={index >= versions.length - 1}
          onClick={() => onShow(versions[index + 1].url)}>
          <ChevronRight className="size-3.5" strokeWidth={1.5} />
        </Button>
      </span>
      {shown && <span className="min-w-0 truncate" title={versionLabel(shown)}>{versionLabel(shown)}</span>}
      {shown && (isCurrent ? (
        <span className="flex items-center gap-1 text-foreground">
          <Check className="size-3.5" strokeWidth={1.5} />
          In use
        </span>
      ) : (
        <Button variant="outline" size="xs" onClick={() => onUse(shown)}>
          Use this version
        </Button>
      ))}
    </div>
  );
}
