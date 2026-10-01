"use client";

import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { useAvatarGeneration } from "@/hooks/use-avatar-generation";
import type { useAvatarStudio } from "@/hooks/use-avatar-studio";
import { avatarWorksWith } from "@/lib/avatars/generation";
import { AvatarCandidateGrid } from "./avatar-candidate-grid";
import { AvatarDescribePanel } from "./avatar-describe-panel";
import { AvatarImageDropzone } from "./avatar-image-dropzone";

type Mode = "describe" | "upload";

type Props = {
  studio: ReturnType<typeof useAvatarStudio>;
  generation: ReturnType<typeof useAvatarGeneration>;
  /** The likeness-consent block, or null when it does not apply. */
  consent: ReactNode;
};

// The Look step: get a front image, either by describing the character and picking a generated
// candidate, or by uploading a photo. Switching mode keeps everything typed so far. Once there is
// a front, the step says which video models it can be used with (D297). The footer's Continue
// waits for the front — and for an upload, the permission — so this step has no button of its own.
export function AvatarStudioLookStep({ studio: s, generation: g, consent }: Props) {
  const front = s.avatar?.front ?? null;
  // Open on the way the current front was made; a new avatar starts on Describe.
  const [mode, setMode] = useState<Mode>(front?.source.kind === "upload" ? "upload" : "describe");
  const busy = g.pending.length > 0;
  const models = s.avatar ? avatarWorksWith(s.avatar) : [];

  return (
    <>
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="self-start">
        <TabsList>
          <TabsTrigger value="describe">Describe</TabsTrigger>
          <TabsTrigger value="upload">Upload a photo</TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "describe" ? (
        <>
          <AvatarDescribePanel
            busy={busy}
            composer={g.composer}
            onComposerChange={g.setComposer}
            onGenerate={g.generate}
          />
          <AvatarCandidateGrid
            candidates={g.candidates}
            pending={g.pending}
            frontUrl={front?.url ?? null}
            picking={g.picking}
            locked={g.generatingSheet}
            onPick={g.pickFront}
          />
          {consent}
        </>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <div className="w-full max-w-[13rem]">
            <AvatarImageDropzone
              label="Add a front image"
              hint="Click, or drop a photo here"
              aspect="3 / 4"
              image={front}
              uploading={s.uploading === "front"}
              disabled={s.uploading !== null || s.confirmingConsent || busy || g.generatingSheet}
              zoomTitle="Front image"
              onFile={(file) => s.uploadImage("front", file)}
            />
          </div>
          <div className="flex min-w-0 flex-1 basis-64 flex-col gap-3">
            <p className="flex gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              An uploaded photo is treated as a real person. Real faces work with Gemini Omni and Kling.
            </p>
            {consent}
          </div>
        </div>
      )}

      {models.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2.5">
          <span className="text-eyebrow text-muted-foreground">This face works with</span>
          {models.map((model) => <Badge key={model} variant="outline" className="bg-card">{model}</Badge>)}
        </div>
      )}
    </>
  );
}
