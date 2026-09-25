"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_VOICE_CHANGE_SETTINGS, type VoiceChangeSettings } from "@/lib/elevenlabs/voice-settings";
import { sourceVersionOptions, defaultSourceVersionId, voiceChangeEstimateCredits, canApplyVoiceChange } from "@/lib/voice-change/workspace";
import { useVoiceChoice } from "@/hooks/use-voice-choice";
import { useChangeVoice } from "@/hooks/use-change-voice";
import { useVoicePreview } from "@/hooks/use-voice-preview";
import type { VideoGenVersionSummary } from "./video-gen-version-history";
import { VideoGenChangeVoiceBrowser } from "./video-gen-change-voice-browser";
import { VideoGenChangeVoiceSettings } from "./video-gen-change-voice-settings";

export type VoiceChangeNodeState = { voiceId: string | null; settings: VoiceChangeSettings };

type Props = {
  nodeId: string;
  versions: VideoGenVersionSummary[];
  activeVersionId: string | null;
  running: boolean;
  value: VoiceChangeNodeState | undefined;
  onChange: (next: VoiceChangeNodeState) => void;
  onApplied: () => void;
};

// D284 — the Change voice workspace: browser (left) + settings and Apply (right).
export function VideoGenChangeVoice({ nodeId, versions, activeVersionId, running, value, onChange, onApplied }: Props) {
  const state: VoiceChangeNodeState = value ?? { voiceId: null, settings: DEFAULT_VOICE_CHANGE_SETTINGS };
  const sources = useMemo(() => sourceVersionOptions(versions), [versions]);
  const [sourceId, setSourceId] = useState<string | null>(() => defaultSourceVersionId(versions, activeVersionId));
  const sourceVersion = versions.find((v) => v.id === sourceId) ?? null;
  const choice = useVoiceChoice(state.voiceId, (voiceId) => onChange({ ...state, voiceId }), true);
  const preview = useVoicePreview(); // single-voice preview in the settings card
  const { apply, submitting } = useChangeVoice(nodeId);

  const duration = Number(sourceVersion?.paramsUsed?.durationSeconds ?? sourceVersion?.paramsUsed?.duration ?? 0);
  const estimatedCredits = choice.voice && duration > 0 ? voiceChangeEstimateCredits(duration, choice.voice.priceMultiplier) : null;
  const gate = canApplyVoiceChange({ sourceId, voice: Boolean(choice.voice), saving: choice.saving, running });

  async function onApply() {
    if (!gate.ok || !sourceId || !state.voiceId) return;
    const r = await apply({ baseVersionId: sourceId, voiceId: state.voiceId, settings: state.settings });
    if (r.ok) {
      toast.success("Changing the voice — the new version will appear when it's ready.");
      onApplied();
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_320px] gap-4">
      <VideoGenChangeVoiceBrowser selectedId={state.voiceId} onSelect={(v) => void choice.choose(v)} />
      <VideoGenChangeVoiceSettings
        sources={sources}
        sourceId={sourceId}
        onSourceChange={setSourceId}
        sourceUrl={sourceVersion?.output ?? null}
        voice={choice.voice}
        saving={choice.saving}
        playing={Boolean(choice.voice && preview.playingId === choice.voice.voiceId)}
        onTogglePreview={() => choice.voice && preview.toggle(choice.voice)}
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
