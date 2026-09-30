"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAvatarGeneration } from "@/hooks/use-avatar-generation";
import { useAvatarStudio } from "@/hooks/use-avatar-studio";
import type { Avatar } from "@/lib/avatars/schema";
import { AvatarLikenessConsent } from "./avatar-likeness-consent";
import { AvatarStudioCard } from "./avatar-studio-card";
import { AvatarStudioLookStep } from "./avatar-studio-look-step";
import { AvatarStudioSheetStep } from "./avatar-studio-sheet-step";

type Step = "look" | "sheet";

type Props = {
  clientId: string;
  clientSlug: string;
  clientName: string;
  initialAvatar: Avatar | null;
};

// D287 — the Avatar Studio: a full page. The steps are on the left, the avatar card on the
// right. Plan 3 adds the Voice step.
export function AvatarStudio({ clientId, clientSlug, clientName, initialAvatar }: Props) {
  const s = useAvatarStudio({ clientId, clientSlug, initialAvatar });
  const g = useAvatarGeneration({
    clientId,
    avatarId: s.avatar?.id ?? null,
    ensureAvatar: s.ensureAvatar,
    onAvatar: s.replaceAvatar,
  });
  // Open on the step that still needs work.
  const [step, setStep] = useState<Step>(
    initialAvatar?.front && (!initialAvatar.sheet || initialAvatar.sheetStale) ? "sheet" : "look",
  );
  const front = s.avatar?.front ?? null;

  // Shown on both steps (D289 amended): an uploaded-front avatar that opens on the sheet step
  // (front already present, sheet missing or stale) would otherwise hide consent on a step the
  // operator never visits, while the Studio card already shows "Permission · Needed" and
  // blocks Save. Not shown mid front-upload — the photo it would apply to is about to change.
  const consent = s.avatar && front?.source.kind === "upload" && s.uploading !== "front" ? (
    <div className="w-full max-w-xs">
      <AvatarLikenessConsent
        key={front.url}
        avatar={s.avatar}
        confirming={s.confirmingConsent}
        onConfirm={s.confirmConsent}
      />
    </div>
  ) : null;

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
            <AvatarStudioLookStep
              studio={s}
              generation={g}
              consent={consent}
              onContinue={() => setStep("sheet")}
            />
          ) : (
            <AvatarStudioSheetStep studio={s} generation={g} consent={consent} />
          )}
        </Card>

        <AvatarStudioCard
          avatar={s.avatar}
          name={s.name}
          story={s.story}
          gaps={s.gaps}
          saving={s.saving}
          busy={s.uploading !== null || g.picking !== null || g.generatingSheet || g.pending.length > 0}
          spentCredits={g.spentCredits}
          onName={s.setName}
          onStory={s.setStory}
          onSave={s.markReady}
          onArchive={s.archive}
        />
      </div>
    </section>
  );
}
