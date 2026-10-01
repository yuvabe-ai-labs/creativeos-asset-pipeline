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

/** D301 — the Avatar Studio's wording: what the operator gets, without the word "clone". */
const INLINE_COPY = {
  hint: "mp3, wav or m4a · one speaker · 1–2 minutes works best, at least 30 seconds",
  upload: "Upload a recording",
  name: "Voice name",
  consent: "I have this person's permission to use their voice.",
  idle: "Create voice",
  busy: "Creating the voice…",
  done: (name: string) => `Voice "${name}" created`,
};

// D292 — Instant Voice Clone for one client, shown inside the voice picker dialog. The cloned
// voice is recorded for the client and handed back, ready to use. D301 — `inline` shows it in
// the Studio's Voice step: no dialog padding, the name filled in, background-noise removal left on
// without asking, and the Studio's plain wording.
export function VoiceCloneForm({
  clientId, onCloned, inline = false, defaultName = "",
}: {
  clientId: string;
  onCloned: (voice: PickerVoice) => void;
  inline?: boolean;
  defaultName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [removeNoise, setRemoveNoise] = useState(true);
  const [consent, setConsent] = useState(false);
  const [cloning, setCloning] = useState(false);

  // Shown under the button once the operator has started, so an untouched form is not an error.
  const problem = validateVoiceCloneInput({
    name, consent, files: files.map((f) => ({ name: f.name, size: f.size })),
  });
  // A name filled in for the operator is not them starting.
  const touched = files.length > 0 || (name.trim().length > 0 && name.trim() !== defaultName.trim());

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
      toast.success(inline ? INLINE_COPY.done(name.trim()) : `Cloned "${name.trim()}"`);
      onCloned(voice);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clone this voice.");
    } finally {
      setCloning(false);
    }
  }

  return (
    <div className={inline ? "flex w-full flex-col gap-4" : "mx-auto flex w-full max-w-xl flex-col gap-4 overflow-y-auto px-6 py-5"}>
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        className="h-auto flex-col gap-1.5 whitespace-normal rounded-xl border-dashed border-primary/40 py-6 text-primary hover:bg-primary/5 hover:text-primary"
      >
        <Upload className="size-5" strokeWidth={1.5} />
        <span className="text-sm font-semibold">{inline ? INLINE_COPY.upload : "Add audio of the speaker"}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {inline
            ? INLINE_COPY.hint
            : `mp3, wav or m4a · up to ${VOICE_CLONE_MAX_LABEL} in total · one to two minutes of clean speech works best`}
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
        <Label htmlFor="voice-clone-name">{inline ? INLINE_COPY.name : "Name"}</Label>
        <Input
          id="voice-clone-name"
          value={name}
          maxLength={VOICE_NAME_MAX}
          placeholder="e.g. James"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {!inline && (
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
      )}

      {!inline && (
        <div className="flex items-center gap-2">
          <Checkbox id="voice-clone-noise" checked={removeNoise} onCheckedChange={(v) => setRemoveNoise(v === true)} />
          <Label htmlFor="voice-clone-noise" className="text-sm font-normal">Remove background noise</Label>
        </div>
      )}
      <div className="flex items-start gap-2">
        <Checkbox
          id="voice-clone-consent"
          checked={consent}
          onCheckedChange={(v) => setConsent(v === true)}
          className="mt-0.5"
        />
        <Label htmlFor="voice-clone-consent" className="text-sm font-normal leading-snug">
          {inline ? INLINE_COPY.consent : VOICE_CLONE_CONSENT_STATEMENT}
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" disabled={problem !== null || cloning} onClick={() => void clone()}>
          {inline ? (cloning ? INLINE_COPY.busy : INLINE_COPY.idle) : cloning ? "Cloning…" : "Clone voice"}
        </Button>
        {touched && problem && <p className="text-xs text-muted-foreground">{problem}</p>}
      </div>
    </div>
  );
}
