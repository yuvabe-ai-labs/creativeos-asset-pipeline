"use client";

import { useState } from "react";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import type { SavedAvatar } from "@/lib/avatars/local-store";
import { useAvatarPersistence } from "@/hooks/use-avatar-persistence";
import { AvatarEditorHeader } from "./avatar-editor-header";
import { AvatarNameField } from "./avatar-name-field";
import { AvatarDescribeStep } from "./avatar-describe-step";
import { AvatarVoiceStep } from "./avatar-voice-step";
import { AvatarGenerateButton } from "./avatar-generate-button";
import { AvatarOutputPanel } from "./avatar-output-panel";

type Props = {
  clientId: string;
  clientSlug: string;
  /** Present when editing a saved random character; absent on /avatar/random. */
  avatar?: SavedAvatar;
};

// A random (AI-described) character: name, a description of the look and a voice on the left;
// a 9:16 preview with the right/left/back views stacked beside it on the right. Saves without an
// image (the gallery shows a silhouette); Generate is not yet connected to a backend.
export function AvatarRandomView({ clientId, clientSlug, avatar }: Props) {
  const [name, setName] = useState(avatar?.name ?? "");
  const [description, setDescription] = useState(avatar?.description ?? "");
  const [voice, setVoice] = useState<PickerVoice | null>(avatar?.voice ?? null);
  const { save, remove } = useAvatarPersistence(clientId, clientSlug, avatar?.id);

  const canSave = name.trim().length > 0 && description.trim().length > 0;

  return (
    <>
      <AvatarEditorHeader
        editingName={avatar?.name}
        canSave={canSave}
        onSave={() =>
          save({ name: name.trim(), description: description.trim(), imageDataUrl: avatar?.imageDataUrl ?? "", voice })
        }
        onDelete={remove}
      />

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-8">
          <AvatarNameField value={name} onChange={setName} label="1. Character name" placeholder="e.g. Alex" />
          <AvatarDescribeStep value={description} onChange={setDescription} />
          <AvatarVoiceStep usePreviewAudio voice={voice} onSelect={setVoice} onClear={() => setVoice(null)} />
          <AvatarGenerateButton disabled={!canSave || voice === null} />
        </div>

        <AvatarOutputPanel />
      </div>
    </>
  );
}
