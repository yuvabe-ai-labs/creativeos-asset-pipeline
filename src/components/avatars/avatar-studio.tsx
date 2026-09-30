"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAvatarStudio } from "@/hooks/use-avatar-studio";
import type { Avatar } from "@/lib/avatars/schema";
import { AvatarImageDropzone } from "./avatar-image-dropzone";
import { AvatarLikenessConsent } from "./avatar-likeness-consent";
import { AvatarStudioCard } from "./avatar-studio-card";

type Step = "look" | "sheet";

type Props = {
  clientId: string;
  clientSlug: string;
  clientName: string;
  initialAvatar: Avatar | null;
};

// D287 — the Avatar Studio: a full page. The steps are on the left, the avatar card on the
// right. Plan 2 adds Describe to the Look step and generation to the sheet step; plan 3 adds
// the Voice step.
export function AvatarStudio({ clientId, clientSlug, clientName, initialAvatar }: Props) {
  const s = useAvatarStudio({ clientId, clientSlug, initialAvatar });
  // Open on the step that still needs work.
  const [step, setStep] = useState<Step>(
    initialAvatar?.front && (!initialAvatar.sheet || initialAvatar.sheetStale) ? "sheet" : "look",
  );
  const front = s.avatar?.front ?? null;

  return (
    <section className="animate-rise mt-4">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`/clients/${clientSlug}/avatars`} />}
        >
          <ChevronLeft className="size-4" strokeWidth={1.5} />
          Avatars
        </Button>
        <div>
          <p className="text-eyebrow text-muted-foreground">{clientName}</p>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em]">
            {s.name.trim() || (initialAvatar ? "Untitled avatar" : "New avatar")}
          </h1>
        </div>
        <Tabs value={step} onValueChange={(v) => setStep(v as Step)} className="ml-auto">
          <TabsList>
            <TabsTrigger value="look">1 · Look</TabsTrigger>
            <TabsTrigger value="sheet" disabled={!front}>2 · Profile sheet</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="flex flex-col gap-4 p-5 shadow-card">
          {step === "look" ? (
            <>
              <div>
                <p className="text-eyebrow text-muted-foreground">Front image</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Facing the camera, waist-up, even light, plain background.
                </p>
              </div>
              <div className="w-full max-w-xs">
                <AvatarImageDropzone
                  label="Add a front image"
                  hint="Click, or drop a photo here"
                  aspect="3 / 4"
                  image={front}
                  uploading={s.uploading === "front"}
                  disabled={s.uploading !== null}
                  onFile={(file) => s.uploadImage("front", file)}
                />
              </div>
              {s.avatar && front?.source.kind === "upload" && s.uploading !== "front" && (
                <div className="w-full max-w-xs">
                  <AvatarLikenessConsent
                    key={front.url}
                    avatar={s.avatar}
                    confirming={s.confirmingConsent}
                    onConfirm={s.confirmConsent}
                  />
                </div>
              )}
              {front && (
                <Button variant="outline" className="self-start" onClick={() => setStep("sheet")}>
                  Continue to profile sheet
                </Button>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-eyebrow text-muted-foreground">Profile sheet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Front, three-quarter, side and back views of the same person, in one image.
                </p>
              </div>
              {s.avatar?.sheetStale && (
                <p className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                  The front image changed. Replace the sheet so it shows the same person.
                </p>
              )}
              <AvatarImageDropzone
                label="Add a profile sheet"
                hint="Click, or drop the sheet here"
                aspect="16 / 9"
                image={s.avatar?.sheet ?? null}
                uploading={s.uploading === "sheet"}
                disabled={s.uploading !== null}
                onFile={(file) => s.uploadImage("sheet", file)}
              />
            </>
          )}
        </Card>

        <AvatarStudioCard
          avatar={s.avatar}
          name={s.name}
          story={s.story}
          gaps={s.gaps}
          saving={s.saving}
          onName={s.setName}
          onStory={s.setStory}
          onSave={s.markReady}
          onArchive={s.archive}
        />
      </div>
    </section>
  );
}
