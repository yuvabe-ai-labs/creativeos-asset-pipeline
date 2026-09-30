"use client";

import type { ReactNode } from "react";
import type { useAvatarGeneration } from "@/hooks/use-avatar-generation";
import type { useAvatarStudio } from "@/hooks/use-avatar-studio";
import { AvatarImageDropzone } from "./avatar-image-dropzone";
import { AvatarSheetGenerate } from "./avatar-sheet-generate";

type Props = {
  studio: ReturnType<typeof useAvatarStudio>;
  generation: ReturnType<typeof useAvatarGeneration>;
  consent: ReactNode;
};

// Step 2 of the Studio: the profile sheet — generated from the front image, or the operator's
// own. While it generates, the slot shows the same-size placeholder an upload does.
export function AvatarStudioSheetStep({ studio: s, generation: g, consent }: Props) {
  const sheet = s.avatar?.sheet ?? null;
  // A pick in flight also locks the sheet: it is about to be made from whatever front the pick
  // resolves to, so Generate must wait for it (plan 2 review).
  const working = s.uploading !== null || g.generatingSheet || g.picking !== null;

  return (
    <>
      <div>
        <p className="text-eyebrow text-muted-foreground">Profile sheet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Three full-body views of the same person in one wide image: front, side and back.
          Generate it from the front image, or add your own.
        </p>
      </div>
      {consent}
      {sheet && s.avatar?.sheetStale && (
        <p className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm">
          The front image changed. Regenerate or replace the sheet so it shows the same person.
        </p>
      )}
      <AvatarSheetGenerate
        hasSheet={sheet !== null}
        generating={g.generatingSheet}
        disabled={working || !s.avatar?.front}
        modelId={g.sheetModelId}
        onModelChange={g.setSheetModelId}
        onGenerate={g.generateSheet}
      />
      <AvatarImageDropzone
        label="Add your own profile sheet"
        hint="Click, or drop the sheet here"
        aspect="16 / 9"
        image={sheet}
        uploading={s.uploading === "sheet" || g.generatingSheet}
        disabled={working}
        onFile={(file) => s.uploadImage("sheet", file)}
      />
    </>
  );
}
