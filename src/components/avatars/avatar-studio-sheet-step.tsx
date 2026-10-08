"use client";

import { useState } from "react";
import type { useAvatarGeneration } from "@/hooks/use-avatar-generation";
import type { useAvatarStudio } from "@/hooks/use-avatar-studio";
import { Button } from "@/components/ui/button";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { AVATAR_VIEW_LABELS } from "@/lib/avatars/constants";
import { missingViews, sheetKind } from "@/lib/avatars/utils";
import { AvatarSheetGenerate } from "./avatar-sheet-generate";
import { AvatarSheetViews } from "./avatar-sheet-views";

type Props = {
  studio: ReturnType<typeof useAvatarStudio>;
  generation: ReturnType<typeof useAvatarGeneration>;
};

const NOTICE = "rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm";

// The Profile sheet step (D288, optional since D295, four views since D339): made from the front
// image, view by view. Sheets are no longer uploaded (D339). An avatar that still has an older
// single-image sheet, three-view or uploaded, can open it until its four views replace it.
export function AvatarStudioSheetStep({ studio: s, generation: g }: Props) {
  const [showOlder, setShowOlder] = useState(false);
  const avatar = s.avatar;
  const kind = avatar ? sheetKind(avatar) : "none";
  const older = kind === "three-view" || kind === "uploaded" ? avatar?.sheet ?? null : null;
  const missing = avatar ? missingViews(avatar) : [];
  const partial = kind === "four-view" && !avatar?.sheetStale && missing.length > 0;
  const working = s.uploading !== null || g.generatingSheet || g.picking !== null;
  const label = partial
    ? `Make the missing ${missing.length === 1 ? `${AVATAR_VIEW_LABELS[missing[0]]} view` : "views"}`
    : kind === "four-view" ? "Regenerate the four views" : "Generate the four views";

  return (
    <>
      {avatar?.sheetStale && kind !== "none" && (
        <p className={NOTICE}>The front image changed. Regenerate the four views so they show the same person.</p>
      )}
      {older && !avatar?.sheetStale && (
        <p className={NOTICE}>
          This avatar has an older single-image sheet. Generate the four views to replace it; storyboard
          panels need them.{" "}
          <Button variant="link" size="xs" className="h-auto p-0" onClick={() => setShowOlder(true)}>
            View it
          </Button>
        </p>
      )}
      <AvatarSheetViews
        name={s.name.trim() || "This avatar"}
        views={avatar?.sheetViews ?? null}
        generating={g.generatingViews}
        stale={avatar?.sheetStale ?? false}
      />
      <AvatarSheetGenerate
        label={label}
        count={partial ? missing.length : 4}
        generating={g.generatingSheet}
        disabled={working || !avatar?.front}
        modelId={g.sheetModelId}
        onModelChange={g.setSheetModelId}
        onGenerate={(modelId) => g.generateSheet(modelId, partial ? missing : undefined)}
      />
      {showOlder && older && (
        <FullScreenImageZoom imageUrl={older.url} title="Older profile sheet" onClose={() => setShowOlder(false)} />
      )}
    </>
  );
}
