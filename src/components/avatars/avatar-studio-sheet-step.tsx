"use client";

import type { useAvatarGeneration } from "@/hooks/use-avatar-generation";
import type { useAvatarStudio } from "@/hooks/use-avatar-studio";
import { AvatarImageDropzone } from "./avatar-image-dropzone";
import { AvatarSheetGenerate } from "./avatar-sheet-generate";

type Props = {
  studio: ReturnType<typeof useAvatarStudio>;
  generation: ReturnType<typeof useAvatarGeneration>;
};

// The Profile sheet step (D288, optional since D295): generated from the front image, or the
// operator's own. While it generates, the slot shows the same-size placeholder an upload does.
// The panel's header says what the step is for; consent is settled on Look, which this step
// waits for (D297).
export function AvatarStudioSheetStep({ studio: s, generation: g }: Props) {
  const sheet = s.avatar?.sheet ?? null;
  // A pick in flight also locks the sheet: it is about to be made from whatever front the pick
  // resolves to, so Generate must wait for it (plan 2 review).
  const working = s.uploading !== null || g.generatingSheet || g.picking !== null;

  return (
    <>
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
        busyLabel={g.generatingSheet ? "Generating the profile sheet…" : "Uploading…"}
        disabled={working}
        zoomTitle="Profile sheet"
        onFile={(file) => s.uploadImage("sheet", file)}
      />
    </>
  );
}
