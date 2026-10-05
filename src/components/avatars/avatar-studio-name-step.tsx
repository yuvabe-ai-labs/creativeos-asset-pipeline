"use client";

import { useEffect, useRef } from "react";
import { Quote } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AVATAR_NAME_MAX, AVATAR_STORY_MAX } from "@/lib/avatars/constants";
import { defaultVoicePreviewLine } from "@/lib/avatars/voice-preview";

type Props = {
  name: string;
  story: string;
  nameError: string | null;
  onName: (value: string) => void;
  onStory: (value: string) => void;
};

// D297 — the name, asked for properly, and the optional story; both save as they are typed. The
// first step: the preview has the avatar say their name, so it is needed before anything else —
// and the line they will say is shown under the field, so the reason is visible.
export function AvatarStudioNameStep({ name, story, nameError, onName, onStory }: Props) {
  const nameRef = useRef<HTMLInputElement>(null);

  // Opening the Studio on this step, or Save refusing an empty name, puts the operator in the
  // field — unless they are already typing somewhere (the header's title shares the name).
  useEffect(() => {
    if (document.activeElement?.tagName !== "INPUT") nameRef.current?.focus();
  }, [nameError]);

  return (
    <div className="flex max-w-xl flex-col gap-7">
      <div className="flex flex-col gap-2">
        <Label htmlFor="avatar-name">Name</Label>
        <Input
          id="avatar-name"
          ref={nameRef}
          value={name}
          maxLength={AVATAR_NAME_MAX}
          placeholder="e.g. Riya"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "avatar-name-error" : "avatar-name-line"}
          onChange={(e) => onName(e.target.value)}
          className="h-11 max-w-sm text-base md:text-base"
        />
        {nameError ? (
          <p id="avatar-name-error" className="text-xs text-destructive-text">{nameError}</p>
        ) : (
          <p id="avatar-name-line" className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Quote className="mt-0.5 size-3.5 shrink-0 text-primary/60" strokeWidth={1.5} />
            <span>
              In the preview they say: <span className="text-foreground">“{defaultVoicePreviewLine(name)}”</span>
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="avatar-story">
            Background story
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">Optional</span>
          </Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {story.length}/{AVATAR_STORY_MAX}
          </span>
        </div>
        <Textarea
          id="avatar-story"
          value={story}
          maxLength={AVATAR_STORY_MAX}
          rows={5}
          placeholder="Who they are, how they speak, what they care about"
          onChange={(e) => onStory(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">For the people working on this avatar: who they are, so everyone keeps them in character.</p>
      </div>
    </div>
  );
}
