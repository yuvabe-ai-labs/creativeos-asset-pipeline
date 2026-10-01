"use client";

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AVATAR_NAME_MAX } from "@/lib/avatars/constants";
import { avatarLifecycle, type AvatarLifecycle } from "@/lib/avatars/studio";
import type { Avatar } from "@/lib/avatars/schema";
import type { StudioSaveState } from "@/hooks/use-avatar-studio";
import { AvatarStudioMenu } from "./avatar-studio-menu";

const BADGE: Record<AvatarLifecycle, { label: string; className: string }> = {
  new: { label: "New", className: "" },
  draft: { label: "Draft", className: "border-warning/40 bg-warning/15 text-warning-text" },
  library: { label: "In the library", className: "border-success/40 bg-success/10 text-success-text" },
};

type Props = {
  avatar: Avatar | null;
  name: string;
  nameError: string | null;
  saveState: StudioSaveState;
  onName: (value: string) => void;
  onArchive: () => void;
};

// D297 — the Studio's header. The title IS the avatar's name, edited in place with the house
// inline-edit affordance, so the name is always in view rather than tucked into a side card.
// The way back is the breadcrumb above it, as on the client's other pages.
export function AvatarStudioHeader({
  avatar, name, nameError, saveState, onName, onArchive,
}: Props) {
  const lifecycle = avatarLifecycle(avatar);
  const badge = BADGE[lifecycle];

  return (
    <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-72">
        <div className="flex flex-wrap items-center gap-2.5">
          <Input
            value={name}
            maxLength={AVATAR_NAME_MAX}
            placeholder="Untitled avatar"
            aria-label="Avatar name"
            aria-invalid={nameError ? true : undefined}
            onChange={(e) => onName(e.target.value)}
            className={cn(
              "-ml-1.5 h-auto w-auto min-w-[11ch] max-w-full border-transparent bg-transparent px-1.5 py-0.5",
              "font-display text-2xl font-semibold tracking-[-0.01em] shadow-none md:text-2xl field-sizing-content",
              "cursor-pointer underline decoration-transparent decoration-dotted decoration-2 underline-offset-[6px]",
              "transition-colors hover:bg-primary/5 hover:decoration-primary/50",
              "focus-visible:cursor-text focus-visible:bg-card focus-visible:decoration-transparent",
            )}
          />
          <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
          {saveState !== "idle" && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
              {saveState === "saving" ? "Saving…" : (
                <>
                  <Check className="size-3.5" strokeWidth={1.5} />
                  Saved
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {lifecycle !== "new" && (
        <div className="ml-auto flex items-center gap-2">
          <AvatarStudioMenu lifecycle={lifecycle} name={name} onConfirm={onArchive} />
        </div>
      )}
    </header>
  );
}
