"use client";

import { Gauge, Mic } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvatarAdvancedSettings } from "@/components/avatars/avatar-advanced-settings";
import { DUB_PACES, PRESENTER_VOICE, type DubLanguage, type DubPace, type DubVoiceChoice } from "@/lib/dubbing/types";
import { FieldLabel } from "./field-label";
import { DubbingVoicePicker } from "./dubbing-voice-picker";

type Props = {
  nodeId: string;
  language: DubLanguage;
  voice: DubVoiceChoice;
  onVoiceChange: (v: DubVoiceChoice) => void;
  pace: DubPace;
  onPaceChange: (p: DubPace) => void;
  disabled: boolean;
};

// D379 — under Advanced, closed by default (the same section Avatars and Visualise use): the voice
// (the presenter's own by default, or a preset with previews) and, for a preset, its pace.
export function DubbingAdvanced({ nodeId, language, voice, onVoiceChange, pace, onPaceChange, disabled }: Props) {
  const preset = voice !== PRESENTER_VOICE;
  return (
    <AvatarAdvancedSettings className="border-t border-border pt-4">
      <div className="flex flex-col gap-5 pt-1">
        <div className="flex flex-col gap-2">
          <FieldLabel icon={Mic} label="Voice" />
          <DubbingVoicePicker nodeId={nodeId} voice={voice} onVoiceChange={onVoiceChange} language={language} disabled={disabled} />
        </div>

        {preset && (
          <div className="flex flex-col gap-2">
            <FieldLabel icon={Gauge} label="Pace" />
            <Select value={pace} onValueChange={(v) => { if (v) onPaceChange(v as DubPace); }} disabled={disabled}>
              <SelectTrigger className="w-full"><SelectValue>{DUB_PACES.find((p) => p.code === pace)?.label}</SelectValue></SelectTrigger>
              <SelectContent>
                {DUB_PACES.map((p) => (
                  <SelectItem key={p.code} value={p.code} className="py-1.5">
                    <span className="flex flex-col gap-0.5 whitespace-normal">
                      <span className="font-medium">{p.label}</span>
                      <span className="text-xs text-muted-foreground">{p.hint}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How fast the voice speaks. The dub still fits the video&apos;s timing, so its length doesn&apos;t change.
            </p>
          </div>
        )}
      </div>
    </AvatarAdvancedSettings>
  );
}
