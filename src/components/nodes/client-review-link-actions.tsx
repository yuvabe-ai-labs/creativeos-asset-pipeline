"use client";

import { Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sharePathFor } from "@/lib/client-review/paths";
import type { ReviewVersion } from "@/lib/client-review/wire";

// D496–D497 — what the client's link to the version on screen gives them, as three icon buttons
// in the focus view's header: copy the link, open it as the client sees it, and whether the
// client can download the cut (pressed = on). Switching versions in the list switches all three.
export function ClientReviewLinkActions({
  shareToken,
  version,
  title,
  editable,
  savingDownload,
  onAllowDownloadChange,
}: {
  shareToken: string;
  version: ReviewVersion;
  title: string;
  editable: boolean;
  savingDownload: boolean;
  onAllowDownloadChange: (allow: boolean) => void;
}) {
  const label = `v${version.versionNo}`;
  const sharePath = sharePathFor(shareToken, title, version);
  const on = version.allowDownload;
  const downloadTip = on
    ? `Client can download ${label}${editable ? ". Click to turn off." : ""}`
    : `Download is off for ${label}${editable ? ". Click to allow it." : ""}`;

  // window is read on click, never during render — canvas components are server-rendered too.
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${sharePath}`);
      toast.success(`${label} link copied`);
    } catch {
      toast.error(`Couldn't copy. Open ${label} as client and copy it from there.`);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={<Button variant="outline" size="icon-lg" aria-label={`Copy ${label} link`} onClick={() => void copyLink()} />}
        >
          <Copy className="size-4" strokeWidth={1.5} />
        </TooltipTrigger>
        <TooltipContent>{`Copy ${label} link`}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon-lg"
              aria-label={`Open ${label} as client`}
              nativeButton={false}
              render={<a href={sharePath} target="_blank" rel="noopener noreferrer" />}
            />
          }
        >
          <ExternalLink className="size-4" strokeWidth={1.5} />
        </TooltipTrigger>
        <TooltipContent>
          {version.legacyLink ? `Open ${label} as client: the link the client already has` : `Open ${label} as client`}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              variant="outline"
              aria-label={`Allow the client to download ${label}`}
              pressed={on}
              disabled={!editable || savingDownload}
              onPressedChange={(pressed) => onAllowDownloadChange(pressed)}
              className="relative size-10 rounded-lg text-muted-foreground data-[pressed]:border-primary/40 data-[pressed]:text-primary aria-pressed:bg-primary/5"
            />
          }
        >
          <Download className="size-4" strokeWidth={1.5} />
          {/* Off: a slash across the icon (Lucide has no "download off"). */}
          {!on && (
            <span aria-hidden className="pointer-events-none absolute h-px w-5 -rotate-45 rounded-full bg-current" />
          )}
        </TooltipTrigger>
        <TooltipContent>{downloadTip}</TooltipContent>
      </Tooltip>
    </div>
  );
}
