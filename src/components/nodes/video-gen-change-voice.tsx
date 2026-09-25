"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { Film, Mic } from "lucide-react";
import { DEFAULT_VOICE_CHANGE_SETTINGS, type VoiceChangeSettings } from "@/lib/elevenlabs/voice-settings";
import { voiceChangeEstimateCredits, canApplyVoiceChange } from "@/lib/voice-change/workspace";
import { durationOfParams } from "@/lib/voice-change/record";
import { versionLabelsById } from "@/lib/generations/version-labels";
import { useVoiceChoice } from "@/hooks/use-voice-choice";
import { useChangeVoice } from "@/hooks/use-change-voice";
import { useVoicePreview } from "@/hooks/use-voice-preview";
import type { VideoGenVersionSummary } from "./video-gen-version-history";
import { LeftSection } from "./focus-left-section";
import { VideoGenChangeVoicePicker } from "./video-gen-change-voice-picker";
import { VideoGenChangeVoiceSettings } from "./video-gen-change-voice-settings";

export type VoiceChangeNodeState = { voiceId: string | null; settings: VoiceChangeSettings };

type Props = {
  nodeId: string;
  versions: VideoGenVersionSummary[];
  /** The version showing in the output column — the take this re-voices (null if it has no video). */
  sourceId: string | null;
  running: boolean;
  value: VoiceChangeNodeState | undefined;
  onChange: (next: VoiceChangeNodeState) => void;
  onApplied: () => void;
};

// D284 — Edit voice, in the focus view's centre column (where Image Gen puts its Edit tools):
// the take, the voice, the settings and Apply. The output column keeps showing the video.
export function VideoGenChangeVoice({ nodeId, versions, sourceId, running, value, onChange, onApplied }: Props) {
  const state: VoiceChangeNodeState = value ?? { voiceId: null, settings: DEFAULT_VOICE_CHANGE_SETTINGS };
  const sourceVersion = versions.find((v) => v.id === sourceId) ?? null;
  const takeLabel = sourceId ? versionLabelsById(versions).get(sourceId) : undefined;
  const choice = useVoiceChoice(state.voiceId, (voiceId) => onChange({ ...state, voiceId }), true);
  const preview = useVoicePreview(); // the voice field's preview button
  const { apply, submitting } = useChangeVoice(nodeId);

  // Picking another voice stops the field's preview of the previous one.
  useEffect(() => {
    preview.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on a voice change
  }, [choice.voice?.voiceId]);

  const duration = durationOfParams(sourceVersion?.paramsUsed ?? {});
  const estimatedCredits = choice.voice && duration > 0 ? voiceChangeEstimateCredits(duration, choice.voice.priceMultiplier) : null;
  const gate = canApplyVoiceChange({ sourceId, voice: Boolean(choice.voice), saving: choice.saving, running });

  async function onApply() {
    if (!gate.ok || !sourceId || !state.voiceId) return;
    // Style and model aren't offered (style 0 is ElevenLabs' recommendation; Multilingual covers
    // every language we ship), so always send the defaults — even if a node still carries a
    // value saved before they were removed from the UI.
    const settings = {
      ...state.settings,
      style: DEFAULT_VOICE_CHANGE_SETTINGS.style,
      modelId: DEFAULT_VOICE_CHANGE_SETTINGS.modelId,
    };
    const r = await apply({ baseVersionId: sourceId, voiceId: state.voiceId, settings });
    if (r.ok) {
      toast.success("Changing the voice — the new version will appear when it's ready.");
      onApplied();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <LeftSection icon={Film} label="Take">
        {sourceId ? (
          <div className="flex flex-col gap-1.5">
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{takeLabel ?? "This version"}</span>
              <span className="text-muted-foreground"> — the version showing on the right</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Re-voiced from this take&apos;s original audio and added as a new version; this one stays.
              To re-voice another take, pick it in History.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            The version showing has no video. Pick a finished version in History to re-voice it.
          </p>
        )}
      </LeftSection>

      <LeftSection icon={Mic} label="Voice">
        <VideoGenChangeVoicePicker
          voice={choice.voice}
          saving={choice.saving}
          playing={Boolean(choice.voice && preview.playingId === choice.voice.voiceId)}
          onTogglePreview={() => choice.voice && preview.toggle(choice.voice)}
          onSelect={(v) => void choice.choose(v)}
        />
      </LeftSection>

      <VideoGenChangeVoiceSettings
        sourceId={sourceId}
        settings={state.settings}
        onSettings={(patch) => onChange({ ...state, settings: { ...state.settings, ...patch } })}
        estimatedCredits={estimatedCredits}
        applyBlockedReason={gate.ok ? null : gate.reason ?? null}
        submitting={submitting}
        onApply={() => void onApply()}
      />
    </div>
  );
}
