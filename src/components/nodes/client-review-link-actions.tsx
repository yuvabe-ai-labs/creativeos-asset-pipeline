"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { copyVersionLink } from "@/lib/client-review/copy-link";
import type { ReviewVersion } from "@/lib/client-review/wire";

const SWITCH_ID = "client-review-allow-download";

// D496–D497 — what the client's link to the version on screen gives them, in the focus view's
// header: copy the link, and an Allow download switch. Switching versions in the list switches both.
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

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-10 items-center gap-2.5 rounded-lg border px-3">
        <Label htmlFor={SWITCH_ID} className="text-sm font-medium">
          Allow download
        </Label>
        <Switch
          id={SWITCH_ID}
          aria-label={`Allow the client to download ${label}`}
          checked={version.allowDownload}
          disabled={!editable || savingDownload}
          onCheckedChange={(v) => onAllowDownloadChange(Boolean(v))}
        />
      </div>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon-lg"
              aria-label={`Copy ${label} link`}
              onClick={() => void copyVersionLink(shareToken, title, version)}
            />
          }
        >
          <Copy className="size-4" strokeWidth={1.5} />
        </TooltipTrigger>
        <TooltipContent>{`Copy ${label} link`}</TooltipContent>
      </Tooltip>
    </div>
  );
}
