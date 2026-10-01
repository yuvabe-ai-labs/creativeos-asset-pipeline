"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import type { AvatarGenerations, VoicePreviewState } from "@/lib/avatars/studio-server";
import { cn } from "@/lib/utils";
import { useAvatarGeneration } from "@/hooks/use-avatar-generation";
import { useAvatarStudio } from "@/hooks/use-avatar-studio";
import { useAvatarVoice } from "@/hooks/use-avatar-voice";
import { useAvatarVoicePreview } from "@/hooks/use-avatar-voice-preview";
import { useStudioSteps } from "@/hooks/use-studio-steps";
import {
  isLookDone, isStepDone, studioOpeningStep, STUDIO_STEPS, type StudioSnapshot,
} from "@/lib/avatars/studio";
import { voiceDeclarationKey } from "@/lib/avatars/voice-preview";
import type { Avatar } from "@/lib/avatars/schema";
import { AvatarLikenessConsent } from "./avatar-likeness-consent";
import { AvatarStudioFooter } from "./avatar-studio-footer";
import { AvatarStudioBreadcrumb } from "./avatar-studio-breadcrumb";
import { AvatarStudioHeader } from "./avatar-studio-header";
import { AvatarStudioLookStep } from "./avatar-studio-look-step";
import { AvatarStudioPreviewStep } from "./avatar-studio-preview-step";
import { AvatarStudioSaveStep } from "./avatar-studio-save-step";
import { AvatarStudioSheetStep } from "./avatar-studio-sheet-step";
import { AvatarStudioStepper } from "./avatar-studio-stepper";
import { AvatarStudioSummary } from "./avatar-studio-summary";
import { AvatarStudioVoiceStep } from "./avatar-studio-voice-step";

type Props = {
  clientId: string;
  clientSlug: string;
  clientName: string;
  initialAvatar: Avatar | null;
  /** Read on the server with the avatar, so a revisit opens with them known (null: load here). */
  initialGenerations?: AvatarGenerations | null;
  initialVoicePreview?: VoicePreviewState | null;
};

// D287, D297 — the Avatar Studio: a full page in three columns. The five steps down the side,
// the current step's panel with its footer pinned to the bottom, and the avatar so far.
export function AvatarStudio({
  clientId, clientSlug, clientName, initialAvatar, initialGenerations, initialVoicePreview,
}: Props) {
  const router = useRouter();
  const libraryHref = `/clients/${clientSlug}/avatars`;
  const s = useAvatarStudio({ clientId, clientSlug, initialAvatar });
  const g = useAvatarGeneration({
    clientId,
    avatarId: s.avatar?.id ?? null,
    initial: initialGenerations,
    ensureAvatar: s.ensureAvatar,
    onAvatar: s.replaceAvatar,
  });
  const v = useAvatarVoice({ clientId, avatarId: s.avatar?.id ?? null, onAvatar: s.replaceAvatar });
  // Pulled out so the callback below depends on the two stable functions, not on the hook
  // objects that carry them — a new identity every render would restart the preview's poll.
  const { refreshSpentCredits } = g;
  const { reload } = s;
  const preview = useAvatarVoicePreview({
    clientId,
    avatarId: s.avatar?.id ?? null,
    declaration: voiceDeclarationKey(s.avatar?.voice ?? null),
    initial: initialVoicePreview
      ? { declaration: voiceDeclarationKey(initialAvatar?.voice ?? null), data: initialVoicePreview }
      : null,
    // A finished native preview writes the voice reference onto the avatar, so the row has to
    // be read again — the summary and the reference card both show what it saved.
    onSettled: useCallback(
      (id: string) => {
        void refreshSpentCredits(id);
        void reload(id);
      },
      [refreshSpentCredits, reload],
    ),
  });
  const steps = useStudioSteps(studioOpeningStep(initialAvatar));

  const avatar = s.avatar;
  const front = avatar?.front ?? null;
  const step = STUDIO_STEPS[steps.index];
  const previous = STUDIO_STEPS[steps.index - 1] ?? null;
  const following = STUDIO_STEPS[steps.index + 1] ?? null;
  const snapshot: StudioSnapshot = {
    avatar,
    name: s.name,
    preview: preview.preview,
    sheetGenerating: g.generatingSheet,
    previewLoading: preview.loading,
    skipped: steps.skipped,
  };
  const busy = s.uploading !== null || g.picking !== null || g.generatingSheet || g.pending.length > 0 || v.saving;
  const lookDone = isLookDone(avatar);
  const lookStep = step.id === "look";

  // Not shown mid front-upload — the photo it would apply to is about to change.
  const consent = avatar && front?.source.kind === "upload" && s.uploading !== "front" ? (
    <div className="w-full max-w-sm">
      <AvatarLikenessConsent
        key={front.url}
        avatar={avatar}
        confirming={s.confirmingConsent}
        onConfirm={s.confirmConsent}
      />
    </div>
  ) : null;

  let body = null;
  if (step.id === "look") {
    body = <AvatarStudioLookStep studio={s} generation={g} consent={consent} />;
  } else if (step.id === "sheet") {
    body = <AvatarStudioSheetStep studio={s} generation={g} />;
  } else if (step.id === "save") {
    body = (
      <AvatarStudioSaveStep
        name={s.name}
        story={s.story}
        nameError={s.nameError}
        onName={s.setName}
        onStory={s.setStory}
      />
    );
  } else if (avatar && step.id === "voice") {
    // Keyed on the front image: a replaced face can change which voices are possible.
    body = <AvatarStudioVoiceStep key={front?.url ?? "none"} clientId={clientId} avatar={avatar} voice={v} />;
  } else if (avatar && step.id === "preview") {
    body = (
      <AvatarStudioPreviewStep
        avatar={avatar}
        preview={preview}
        disabled={v.saving}
        onBackToVoice={() => steps.go("voice")}
      />
    );
  }

  const primary = step.id !== "save"
    ? {
        label: `Continue to ${following?.title.toLowerCase() ?? ""}`,
        onClick: () => steps.next(isStepDone(step.id, snapshot)),
        disabled: step.id === "look" && !lookDone,
        forward: true,
      }
    : avatar?.status === "ready"
      ? { label: "Done", onClick: () => router.push(libraryHref) }
      : { label: s.saving ? "Saving…" : "Save to library", onClick: s.markReady, disabled: busy || s.saving || !avatar };
  const reason = step.id === "look" && !lookDone
    ? front ? "Confirm permission to continue" : "Pick a front image to continue"
    : null;

  return (
    <>
    <AvatarStudioBreadcrumb clientSlug={clientSlug} clientName={clientName} name={s.name} />
    <section className="animate-rise mt-4">
      <AvatarStudioHeader
        avatar={avatar}
        name={s.name}
        nameError={s.nameError}
        saveState={s.saveState}
        onName={s.setName}
        onArchive={s.archive}
      />

      {/* On the Look step the summary gives its column to the step, whose generated images sit on
          the right; the summary would only repeat the front those images already show. */}
      <div className={cn("grid gap-6", lookStep ? "lg:grid-cols-[13.5rem_minmax(0,1fr)]" : "lg:grid-cols-[13.5rem_minmax(0,1fr)_16rem]")}>
        <AvatarStudioStepper current={steps.current} snapshot={snapshot} onGo={steps.go} />

        <Card role="region" className="min-h-[34rem] gap-0 overflow-visible py-0 shadow-card" aria-labelledby="studio-step-title">
          <div className="flex flex-col gap-1 px-6 pt-5">
            <p className="text-eyebrow text-muted-foreground">
              Step {steps.index + 1} of {STUDIO_STEPS.length}{step.optional && " · Optional"}
            </p>
            <h2 id="studio-step-title" className="font-display text-xl font-semibold tracking-[-0.01em]">
              {step.heading}
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground">{step.lede}</p>
          </div>
          <div className="flex flex-1 flex-col gap-4 px-6 pb-6 pt-4">{body}</div>
          <AvatarStudioFooter
            back={previous ? { label: `Back to ${previous.title.toLowerCase()}`, onClick: steps.back } : null}
            primary={primary}
            reason={reason}
          />
        </Card>

        {!lookStep && <AvatarStudioSummary avatar={avatar} name={s.name} />}
      </div>
    </section>
    </>
  );
}
