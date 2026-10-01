"use client";

import { useRef, useState } from "react";
import { FileAudio, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { elevenLabsApi } from "@/lib/elevenlabs/api";
import {
  validateVoiceCloneInput, VOICE_CLONE_ACCEPT, VOICE_CLONE_CONSENT_STATEMENT,
  VOICE_CLONE_MAX_LABEL, VOICE_NAME_MAX,
} from "@/lib/elevenlabs/client-voices";
import { formatBytes } from "@/lib/kb/utils";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";

// D292 — Instant Voice Clone for one client, shown inside the voice picker dialog. The cloned
// voice is recorded for the client and handed back, ready to use.
export function VoiceCloneForm({
  clientId, onCloned,
}: { clientId: string; onCloned: (voice: PickerVoice) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [removeNoise, setRemoveNoise] = useState(true);
  const [consent, setConsent] = useState(false);
  const [cloning, setCloning] = useState(false);

  // Shown under the button once the operator has started, so an untouched form is not an error.
  const problem = validateVoiceCloneInput({
    name, consent, files: files.map((f) => ({ name: f.name, size: f.size })),
  });
  const touched = files.length > 0 || name.trim().length > 0;

  async function clone() {
    if (problem || cloning) return;
    setCloning(true);
    try {
      const form = new FormData();
      form.set("name", name.trim());
      if (description.trim()) form.set("description", description.trim());
      form.set("removeBackgroundNoise", String(removeNoise));
      form.set("consent", "true");
      for (const file of files) form.append("files", file);
      const voice = await elevenLabsApi.cloneClientVoice(clientId, form);
      toast.success(`Cloned "${name.trim()}"`);
      onCloned(voice);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clone this voice.");
    } finally {
      setCloning(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 overflow-y-auto px-6 py-5">
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        className="h-auto flex-col gap-1.5 whitespace-normal rounded-xl border-dashed border-primary/40 py-6 text-primary hover:bg-primary/5 hover:text-primary"
      >
        <Upload className="size-5" strokeWidth={1.5} />
        <span className="text-sm font-semibold">Add audio of the speaker</span>
        <span className="text-xs font-normal text-muted-foreground">
          mp3, wav or m4a · up to {VOICE_CLONE_MAX_LABEL} in total · one to two minutes of clean speech works best
        </span>
      </Button>
      <Input
        ref={inputRef}
        type="file"
        accept={VOICE_CLONE_ACCEPT}
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <FileAudio className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
              >
                <X className="size-3.5" strokeWidth={1.5} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="voice-clone-name">Name</Label>
        <Input
          id="voice-clone-name"
          value={name}
          maxLength={VOICE_NAME_MAX}
          placeholder="e.g. James"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="voice-clone-description">Description (optional)</Label>
        <Input
          id="voice-clone-description"
          value={description}
          maxLength={200}
          placeholder="e.g. Middle-aged Indian male, calm and confident"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="voice-clone-noise" checked={removeNoise} onCheckedChange={(v) => setRemoveNoise(v === true)} />
        <Label htmlFor="voice-clone-noise" className="text-sm font-normal">Remove background noise</Label>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="voice-clone-consent"
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          className="mt-0.5"
        />
        <Label htmlFor="voice-clone-consent" className="text-sm font-normal leading-snug">
          {VOICE_CLONE_CONSENT_STATEMENT}
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" disabled={problem !== null || cloning} onClick={() => void clone()}>
          {cloning ? "Cloning…" : "Clone voice"}
        </Button>
        {touched && problem && <p className="text-xs text-muted-foreground">{problem}</p>}
      </div>
    </div>
  );
}
