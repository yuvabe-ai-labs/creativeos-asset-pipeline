"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { useAvatarGeneration } from "@/hooks/use-avatar-generation";
import type { useAvatarStudio } from "@/hooks/use-avatar-studio";
import { AvatarCandidateGrid } from "./avatar-candidate-grid";
import { AvatarDescribePanel } from "./avatar-describe-panel";
import { AvatarImageDropzone } from "./avatar-image-dropzone";

type Mode = "describe" | "upload";

type Props = {
  studio: ReturnType<typeof useAvatarStudio>;
  generation: ReturnType<typeof useAvatarGeneration>;
  /** The likeness-consent block, or null when it does not apply. */
  consent: ReactNode;
  onContinue: () => void;
};

// Step 1 of the Studio: get a front image, either by describing the character and picking a
// generated candidate, or by uploading a photo. Switching mode keeps everything typed so far.
export function AvatarStudioLookStep({ studio: s, generation: g, consent, onContinue }: Props) {
  const front = s.avatar?.front ?? null;
  // Open on the way the current front was made; a new avatar starts on Describe.
  const [mode, setMode] = useState<Mode>(front?.source.kind === "upload" ? "upload" : "describe");
  const busy = g.pending.length > 0;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow text-muted-foreground">Front image</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Facing the camera, waist-up, even light, plain background.
          </p>
        </div>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="describe">Describe</TabsTrigger>
            <TabsTrigger value="upload">Upload photo</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {mode === "describe" ? (
        <>
          <AvatarDescribePanel busy={busy} onGenerate={g.generate} />
          <AvatarCandidateGrid
            candidates={g.candidates}
            pending={g.pending}
            frontUrl={front?.url ?? null}
            picking={g.picking}
            onPick={g.pickFront}
          />
        </>
      ) : (
        <div className="w-full max-w-xs">
          <AvatarImageDropzone
            label="Add a front image"
            hint="Click, or drop a photo here"
            aspect="3 / 4"
            image={front}
            uploading={s.uploading === "front"}
            disabled={s.uploading !== null || s.confirmingConsent || busy}
            onFile={(file) => s.uploadImage("front", file)}
          />
        </div>
      )}

      {consent}
      {front && (
        <Button variant="outline" className="self-start" onClick={onContinue}>
          Continue to profile sheet
        </Button>
      )}
    </>
  );
}
