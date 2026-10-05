"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AVATAR_NAME_MAX, AVATAR_STORY_MAX } from "@/lib/avatars/constants";

type Props = {
  name: string;
  story: string;
  nameError: string | null;
  onName: (value: string) => void;
  onStory: (value: string) => void;
};

// D297 — the name, asked for properly, and the optional story; both save as they are typed. The
// first step: the preview has the avatar say their name, so it is needed before anything else.
export function AvatarStudioNameStep({ name, story, nameError, onName, onStory }: Props) {
  const nameRef = useRef<HTMLInputElement>(null);

  // Opening the Studio on this step, or Save refusing an empty name, puts the operator in the
  // field — unless they are already typing somewhere (the header's title shares the name).
  useEffect(() => {
    if (document.activeElement?.tagName !== "INPUT") nameRef.current?.focus();
  }, [nameError]);

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="avatar-name">Name</Label>
        <Input
          id="avatar-name"
          ref={nameRef}
          value={name}
          maxLength={AVATAR_NAME_MAX}
          placeholder="e.g. Riya"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "avatar-name-error" : undefined}
          onChange={(e) => onName(e.target.value)}
        />
        {nameError && <p id="avatar-name-error" className="text-xs text-destructive-text">{nameError}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="avatar-story">
          Background story
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">Optional</span>
        </Label>
        <Textarea
          id="avatar-story"
          value={story}
          maxLength={AVATAR_STORY_MAX}
          rows={3}
          placeholder="Who they are, how they speak, what they care about"
          onChange={(e) => onStory(e.target.value)}
        />
      </div>
    </div>
  );
}
