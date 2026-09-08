"use client";

import { useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HandleIdentity } from "@/lib/market/performance";

/** Initials for the avatar fallback — Instagram's CDN links are signed and expire,
 *  so the image failing is an expected state, not an error worth surfacing. */
function initials(handle: string) {
  return handle.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase();
}

export function HandleIdentityStrip({
  handle,
  identity,
  onRemove,
}: {
  handle: string;
  identity: HandleIdentity | null;
  onRemove: () => void;
}) {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showAvatar = identity?.avatarUrl && !avatarFailed;

  return (
    <div className="flex items-center gap-3.5">
      {/* color-mix, not `var(--color-primary)/0.45` — a slash-alpha on a var() inside a
          gradient is invalid CSS, so the whole declaration drops and the initials render
          white-on-white. */}
      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_30%_30%,color-mix(in_srgb,var(--color-primary)_55%,white),var(--color-primary))] font-display text-sm font-semibold text-primary-foreground">
        {showAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={identity.avatarUrl ?? ""}
            alt=""
            className="size-full object-cover"
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          initials(handle)
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">@{handle}</p>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {identity?.category && <span className="truncate">{identity.category}</span>}
          {identity?.category && identity?.externalUrl && <span aria-hidden>·</span>}
          {identity?.externalUrl && (
            <a
              href={identity.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1 truncate hover:text-foreground"
            >
              <span className="truncate">{identity.externalUrl.replace(/^https?:\/\//, "")}</span>
              <ExternalLink strokeWidth={1.5} className="size-3 shrink-0" />
            </a>
          )}
          {!identity?.category && !identity?.externalUrl && (
            <span className="text-muted-foreground/70">No profile details captured yet</span>
          )}
        </p>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onRemove}
        className="shrink-0 text-muted-foreground hover:text-destructive"
        aria-label={`Stop tracking @${handle}`}
      >
        <Trash2 strokeWidth={1.5} />
        Stop tracking
      </Button>
    </div>
  );
}
