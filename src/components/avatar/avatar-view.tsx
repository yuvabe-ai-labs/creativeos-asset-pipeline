"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import { fileToAvatarDataUrl } from "@/lib/avatars/image";
import type { SavedAvatar } from "@/lib/avatars/local-store";
import { useAvatarPersistence } from "@/hooks/use-avatar-persistence";
import { AvatarEditorHeader } from "./avatar-editor-header";
import { AvatarNameField } from "./avatar-name-field";
import { AvatarUploadStep } from "./avatar-upload-step";
import { AvatarVoiceStep } from "./avatar-voice-step";
import { AvatarGenerateButton } from "./avatar-generate-button";
import { AvatarOutputPanel } from "./avatar-output-panel";

type Props = {
  clientId: string;
  clientSlug: string;
  /** Present when editing; absent on /avatar/new. */
  avatar?: SavedAvatar;
};

// A real character: name, uploaded reference image and voice on the left; the example output
// (talking preview + right/left/back views) on the right. Saved to this browser only
// (local-store.ts); Generate is not yet connected to a backend.
export function AvatarView({ clientId, clientSlug, avatar }: Props) {
  const [name, setName] = useState(avatar?.name ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(avatar?.imageDataUrl || null);
  const [voice, setVoice] = useState<PickerVoice | null>(avatar?.voice ?? null);
  const { save, remove } = useAvatarPersistence(clientId, clientSlug, avatar?.id);

  const canSave = name.trim().length > 0 && imageUrl !== null;

  async function selectImage(file: File) {
    try {
      setImageUrl(await fileToAvatarDataUrl(file));
    } catch {
      toast.error("Couldn't read that image.");
    }
  }

  return (
    <>
      <AvatarEditorHeader
        editingName={avatar?.name}
        canSave={canSave}
        onSave={() => imageUrl && save({ name: name.trim(), imageDataUrl: imageUrl, voice })}
        onDelete={remove}
      />

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-8">
          <AvatarNameField value={name} onChange={setName} label="1. Character name" placeholder="e.g. Alex" />
          <AvatarUploadStep imageUrl={imageUrl} onSelect={selectImage} onClear={() => setImageUrl(null)} />
          <AvatarVoiceStep voice={voice} onSelect={setVoice} onClear={() => setVoice(null)} />
          <AvatarGenerateButton disabled={!canSave || voice === null} />
        </div>

        <AvatarOutputPanel />
      </div>
    </>
  );
}
