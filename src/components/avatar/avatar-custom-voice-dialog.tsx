"use client";

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { ArrowUp, FileAudio, Link2, Loader2, Plus, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { PickerVoice } from "@/lib/elevenlabs/voice-catalog";
import {
  VOICE_SAMPLE_ACCEPT,
  VOICE_SAMPLE_MAX_BYTES,
  VOICE_SAMPLE_MIN_SECONDS,
  formatSeconds,
  isYouTubeUrl,
  readMediaDuration,
} from "@/lib/avatars/voice-sample";

type Sample = { file: File; url: string; seconds: number };

const customVoice = (fields: Pick<PickerVoice, "name" | "description" | "previewUrl">): PickerVoice => ({
  voiceId: `custom-${crypto.randomUUID()}`,
  source: "account",
  labels: {},
  category: "generated",
  priceMultiplier: 1,
  ...fields,
});

// "Create custom voice": a voice sample from an uploaded audio/video file (≥ 30 s) or a YouTube
// link. Submit hands it back as the chosen voice. UI only — nothing is sent to a voice service.
export function AvatarCustomVoiceDialog({ onCreate }: { onCreate: (voice: PickerVoice) => void }) {
  const [open, setOpen] = useState(false);
  const [sample, setSample] = useState<Sample | null>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const linkValid = isYouTubeUrl(link);
  const canSubmit = !checking && (sample !== null || linkValid);

  function reset() {
    setSample(null);
    setLink("");
    setError(null);
    setDragOver(false);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    const isVideo = file.type.startsWith("video/");
    if (!isVideo && !file.type.startsWith("audio/")) return setError("Choose an audio or video file.");
    if (file.size > VOICE_SAMPLE_MAX_BYTES) return setError("That file is over 50 MB.");

    const url = URL.createObjectURL(file);
    setChecking(true);
    try {
      const seconds = await readMediaDuration(url, isVideo);
      if (seconds < VOICE_SAMPLE_MIN_SECONDS) {
        URL.revokeObjectURL(url);
        setError(`That clip is ${formatSeconds(seconds)} long; it needs at least ${VOICE_SAMPLE_MIN_SECONDS} seconds.`);
        return;
      }
      setSample({ file, url, seconds });
      setLink("");
    } catch (e) {
      URL.revokeObjectURL(url);
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      setChecking(false);
    }
  }

  function clearSample() {
    if (sample) URL.revokeObjectURL(sample.url);
    setSample(null);
  }

  function submit() {
    if (sample) {
      const kind = sample.file.type.startsWith("video/") ? "video" : "audio";
      // The object URL stays alive: it's the chosen voice's play-preview on the editor.
      onCreate(
        customVoice({
          name: sample.file.name,
          description: `Uploaded ${kind} · ${formatSeconds(sample.seconds)}`,
          previewUrl: sample.url,
        }),
      );
    } else if (linkValid) {
      onCreate(customVoice({ name: "YouTube voice sample", description: link.trim(), previewUrl: null }));
    }
    setSample(null);
    reset();
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          clearSample();
          reset();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="h-auto min-h-11 gap-2 border-dashed border-primary/40 py-2 hover:bg-primary/5"
          />
        }
      >
        Create custom voice
        <Plus className="size-4" strokeWidth={1.5} />
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Create custom voice</DialogTitle>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept={VOICE_SAMPLE_ACCEPT}
          className="hidden"
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        <div
          onDragOver={(e: DragEvent) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            void pick(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-7 text-center transition-colors",
            dragOver ? "border-primary bg-primary/10" : "border-primary/40 bg-primary/[0.03]",
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ArrowUp className="size-6" strokeWidth={1.5} />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Upload a video or audio</span>
            <span className="text-xs text-muted-foreground">Minimum {VOICE_SAMPLE_MIN_SECONDS} seconds of clear speech</span>
          </div>

          {sample ? (
            <div className="flex w-full max-w-sm items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left">
              <FileAudio className="size-4 shrink-0 text-primary" strokeWidth={1.5} />
              <span className="min-w-0 flex-1 truncate text-sm">{sample.file.name}</span>
              <span className="text-xs text-muted-foreground">{formatSeconds(sample.seconds)}</span>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Remove file" onClick={clearSample}>
                <X className="size-3.5" strokeWidth={1.5} />
              </Button>
            </div>
          ) : (
            <Button size="sm" className="gap-1.5" disabled={checking} onClick={() => inputRef.current?.click()}>
              {checking ? (
                <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
              ) : (
                <Upload className="size-3.5" strokeWidth={1.5} />
              )}
              {checking ? "Checking…" : "Upload audio"}
            </Button>
          )}
          <span className="text-xs text-muted-foreground">Formats: MP3, WAV, M4A, MP4, MOV, WEBM · up to 50 MB</span>

          <div className="flex w-full max-w-sm items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex w-full max-w-sm flex-col gap-1.5 text-left">
            <InputGroup aria-invalid={link.length > 0 && !linkValid}>
              <InputGroupAddon>
                <Link2 className="size-4" strokeWidth={1.5} />
              </InputGroupAddon>
              <InputGroupInput
                value={link}
                placeholder="Paste a YouTube URL"
                aria-invalid={link.length > 0 && !linkValid}
                onChange={(e) => {
                  setLink(e.target.value);
                  if (e.target.value) clearSample();
                }}
              />
            </InputGroup>
            {link.length > 0 && !linkValid && (
              <span className="text-xs text-destructive">Enter a YouTube video link.</span>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button size="lg" className="mx-auto w-full max-w-xs" disabled={!canSubmit} onClick={submit}>
          Submit
        </Button>
      </DialogContent>
    </Dialog>
  );
}
