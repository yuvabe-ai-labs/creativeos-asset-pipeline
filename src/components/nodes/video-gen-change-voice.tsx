"use client";

import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Film, Mic } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_VOICE_CHANGE_SETTINGS, type VoiceChangeSettings } from "@/lib/elevenlabs/voice-settings";
import { sourceVersionOptions, voiceChangeEstimateCredits, canApplyVoiceChange } from "@/lib/voice-change/workspace";
import { durationOfParams } from "@/lib/voice-change/record";
import { useVoiceChoice } from "@/hooks/use-voice-choice";
import { useChangeVoice } from "@/hooks/use-change-voice";
import { useVoicePreview } from "@/hooks/use-voice-preview";
import type { VideoGenVersionSummary } from "./video-gen-version-history";
import { LeftSection } from "./focus-left-section";
import { VideoGenChangeVoiceBrowser } from "./video-gen-change-voice-browser";
import { VideoGenChangeVoiceSettings } from "./video-gen-change-voice-settings";

export type VoiceChangeNodeState = { voiceId: string | null; settings: VoiceChangeSettings };

type Props = {
  nodeId: string;
  versions: VideoGenVersionSummary[];
  /** The take being re-voiced — owned by the focus view, which also shows it in the video column. */
  sourceId: string | null;
  onSourceChange: (id: string) => void;
  running: boolean;
  value: VoiceChangeNodeState | undefined;
  onChange: (next: VoiceChangeNodeState) => void;
  onApplied: () => void;
};

// D284 — Edit voice, in the focus view's centre column (the same place Image Gen puts its edit
// tools): which take, which voice, the settings, and Apply. The take plays in the video column.
export function VideoGenChangeVoice({ nodeId, versions, sourceId, onSourceChange, running, value, onChange, onApplied }: Props) {
  const state: VoiceChangeNodeState = value ?? { voiceId: null, settings: DEFAULT_VOICE_CHANGE_SETTINGS };
  const sources = useMemo(() => sourceVersionOptions(versions), [versions]);
  const sourceVersion = versions.find((v) => v.id === sourceId) ?? null;
  const choice = useVoiceChoice(state.voiceId, (voiceId) => onChange({ ...state, voiceId }), true);
  const preview = useVoicePreview(); // the chosen voice's preview button in the settings card
  const { apply, submitting } = useChangeVoice(nodeId);

  // Picking another voice stops the card's preview of the previous one (`stop` only stops a
  // preview this card started — see use-voice-preview.ts).
  useEffect(() => {
    preview.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on a voice change
  }, [choice.voice?.voiceId]);

  const duration = durationOfParams(sourceVersion?.paramsUsed ?? {});
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
    <div className="flex flex-col gap-8">
      <LeftSection icon={Film} label="Take">
        <div className="flex flex-col gap-1.5">
          <Select value={sourceId ?? undefined} onValueChange={(v) => v && onSourceChange(String(v))}>
            <SelectTrigger size="sm" className="nodrag w-full" aria-label="Take to re-voice">
              <SelectValue>{sources.find((s) => s.id === sourceId)?.label ?? "Pick a version"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Re-voiced from this take&apos;s original audio. The result is added as a new version; this one stays.
          </p>
        </div>
      </LeftSection>

      <LeftSection icon={Mic} label="Voice">
        <VideoGenChangeVoiceBrowser selectedId={state.voiceId} onSelect={(v) => void choice.choose(v)} />
      </LeftSection>

      <VideoGenChangeVoiceSettings
        sourceId={sourceId}
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
